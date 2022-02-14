import express = require('express');
import { getConnection } from 'typeorm';
import validator from 'validator';
import { v4 as uuid } from 'uuid';

import * as utils from './shared/utils';
import { Db } from '../../src';
import config = require('../../config');
import { SUCCESS_RESPONSE_BODY } from './shared/constants';
import { getLogger } from '../../src/Logger';
import { LoggerProxy } from 'n8n-workflow';
import { Role } from '../../src/databases/entities/Role';
import {
	randomEmail,
	randomValidPassword,
	randomName,
	randomInvalidPassword,
} from './shared/random';
import { createMember, getGlobalMemberRole, getGlobalOwnerRole } from './shared/utils';

let app: express.Application;
let globalOwnerRole: Role;
let globalMemberRole: Role;

beforeAll(async () => {
	app = utils.initTestServer({ namespaces: ['users'], applyAuth: true });
	await utils.initTestDb();

	globalOwnerRole = await getGlobalOwnerRole();
	globalMemberRole = await getGlobalMemberRole();

	config.set('logs.output', 'file'); // declutter console output
	const logger = getLogger();
	LoggerProxy.init(logger);
});

beforeEach(async () => {
	await utils.truncateUserTable();

	jest.isolateModules(() => {
		jest.mock('../../config');
	});

	await Db.collections.User!.save({
		id: INITIAL_TEST_USER.id,
		email: INITIAL_TEST_USER.email,
		password: INITIAL_TEST_USER.password,
		firstName: INITIAL_TEST_USER.firstName,
		lastName: INITIAL_TEST_USER.lastName,
		createdAt: new Date(),
		updatedAt: new Date(),
		globalRole: globalOwnerRole,
	});

	config.set('userManagement.hasOwner', true);
	config.set('userManagement.emails.mode', '');
});

afterEach(async () => {
	await utils.truncateUserTable();
});

afterAll(() => {
	return getConnection().close();
});

test('GET /users should return all users', async () => {
	const owner = await Db.collections.User!.findOneOrFail();
	const authOwnerAgent = await utils.createAuthAgent(app, owner);

	await createMember(globalMemberRole);

	const response = await authOwnerAgent.get('/users');

	expect(response.statusCode).toBe(200);
	expect(response.body.data.length).toBe(2);

	for (const user of response.body.data) {
		const {
			id,
			email,
			firstName,
			lastName,
			personalizationAnswers,
			globalRole,
			password,
			resetPasswordToken,
		} = user;

		expect(validator.isUUID(id)).toBe(true);
		expect(email).toBeDefined();
		expect(firstName).toBeDefined();
		expect(lastName).toBeDefined();
		expect(personalizationAnswers).toBeNull();
		expect(password).toBeUndefined();
		expect(resetPasswordToken).toBeUndefined();
		expect(globalRole).toBeUndefined();
	}
});

test('DELETE /users/:id should delete the user', async () => {
	const owner = await Db.collections.User!.findOneOrFail();
	const authOwnerAgent = await utils.createAuthAgent(app, owner);

	const { id: idToDelete } = await createMember(globalMemberRole);

	const response = await authOwnerAgent.delete(`/users/${idToDelete}`);

	expect(response.statusCode).toBe(200);
	expect(response.body).toEqual(SUCCESS_RESPONSE_BODY);
});

test('DELETE /users/:id should fail to delete self', async () => {
	const owner = await Db.collections.User!.findOneOrFail();
	const authOwnerAgent = await utils.createAuthAgent(app, owner);

	const response = await authOwnerAgent.delete(`/users/${owner.id}`);

	expect(response.statusCode).toBe(400);
});

test('DELETE /users/:id should fail if user to delete is transferee', async () => {
	const owner = await Db.collections.User!.findOneOrFail();
	const authOwnerAgent = await utils.createAuthAgent(app, owner);

	const { id: idToDelete } = await createMember(globalMemberRole);

	const response = await authOwnerAgent.delete(`/users/${idToDelete}`).query({
		transferId: idToDelete,
	});

	expect(response.statusCode).toBe(400);
});

test('DELETE /users/:id with transferId should perform transfer', async () => {
	const owner = await Db.collections.User!.findOneOrFail();
	const authOwnerAgent = await utils.createAuthAgent(app, owner);

	const workflowOwnerRole = await Db.collections.Role!.findOneOrFail({
		name: 'owner',
		scope: 'workflow',
	});

	const userToDelete = await Db.collections.User!.save({
		id: uuid(),
		email: randomEmail(),
		password: randomValidPassword(),
		firstName: randomName(),
		lastName: randomName(),
		createdAt: new Date(),
		updatedAt: new Date(),
		globalRole: workflowOwnerRole,
	});

	const savedWorkflow = await Db.collections.Workflow!.save({
		name: randomName(),
		active: false,
		connections: {},
	});

	await Db.collections.SharedWorkflow!.save({
		role: workflowOwnerRole,
		user: userToDelete,
		workflow: savedWorkflow,
	});

	const response = await authOwnerAgent.delete(`/users/${userToDelete.id}`).query({
		transferId: owner.id,
	});

	expect(response.statusCode).toBe(200);

	const shared = await Db.collections.SharedWorkflow!.findOneOrFail({
		relations: ['user'],
		where: { user: owner },
	});

	expect(shared.user.id).toBe(owner.id);
});

test('GET /resolve-signup-token should validate invite token', async () => {
	const owner = await Db.collections.User!.findOneOrFail();
	const authOwnerAgent = await utils.createAuthAgent(app, owner);

	const { id: inviteeId } = await createMember(globalMemberRole);

	const response = await authOwnerAgent
		.get('/resolve-signup-token')
		.query({ inviterId: INITIAL_TEST_USER.id })
		.query({ inviteeId });

	expect(response.statusCode).toBe(200);
	expect(response.body).toEqual({
		data: {
			inviter: {
				firstName: INITIAL_TEST_USER.firstName,
				lastName: INITIAL_TEST_USER.lastName,
			},
		},
	});
});

test('GET /resolve-signup-token should fail with invalid inputs', async () => {
	const owner = await Db.collections.User!.findOneOrFail();
	const authOwnerAgent = await utils.createAuthAgent(app, owner);

	const { id: inviteeId } = await createMember(globalMemberRole);

	const first = await authOwnerAgent
		.get('/resolve-signup-token')
		.query({ inviterId: INITIAL_TEST_USER.id });

	const second = await authOwnerAgent.get('/resolve-signup-token').query({ inviteeId });

	const third = await authOwnerAgent
		.get('/resolve-signup-token')
		.query({ inviterId: '123', inviteeId: '456' });

	await Db.collections.User!.update(owner.id, { email: '' }); // cause inconsistent DB state

	const fourth = await authOwnerAgent
		.get('/resolve-signup-token')
		.query({ inviterId: INITIAL_TEST_USER.id })
		.query({ inviteeId });

	for (const response of [first, second, third, fourth]) {
		expect(response.statusCode).toBe(400);
	}
});

test('POST /users/:id should fill out a user shell', async () => {
	const authlessAgent = await utils.createAuthlessAgent(app);

	const userToFillOut = await Db.collections.User!.save({
		email: randomEmail(),
		globalRole: globalMemberRole,
	});

	const response = await authlessAgent.post(`/users/${userToFillOut.id}`).send({
		inviterId: INITIAL_TEST_USER.id,
		firstName: randomName(),
		lastName: randomName(),
		password: randomValidPassword(),
	});

	const {
		id,
		email,
		firstName,
		lastName,
		personalizationAnswers,
		password,
		resetPasswordToken,
		globalRole,
	} = response.body.data;

	expect(validator.isUUID(id)).toBe(true);
	expect(email).toBeDefined();
	expect(firstName).toBeDefined();
	expect(lastName).toBeDefined();
	expect(personalizationAnswers).toBeNull();
	expect(password).toBeUndefined();
	expect(resetPasswordToken).toBeUndefined();
	expect(globalRole).toBeUndefined();

	const authToken = utils.getAuthToken(response);
	expect(authToken).toBeDefined();
});

test('POST /users/:id should fail with invalid inputs', async () => {
	const authlessAgent = await utils.createAuthlessAgent(app);

	const userToFillOut = await Db.collections.User!.save({
		email: randomEmail(),
		globalRole: globalMemberRole,
	});

	for (const invalidPayload of INVALID_FILL_OUT_USER_PAYLOADS) {
		const response = await authlessAgent.post(`/users/${userToFillOut.id}`).send(invalidPayload);
		expect(response.statusCode).toBe(400);
	}
});

test('POST /users/:id should fail with already accepted invite', async () => {
	const authlessAgent = await utils.createAuthlessAgent(app);

	const globalMemberRole = await Db.collections.Role!.findOneOrFail({
		name: 'member',
		scope: 'global',
	});

	const userToFillOut = await Db.collections.User!.save({
		email: randomEmail(),
		password: randomValidPassword(), // simulate accepted invite
		globalRole: globalMemberRole,
	});

	const response = await authlessAgent.post(`/users/${userToFillOut.id}`).send({
		inviterId: INITIAL_TEST_USER.id,
		firstName: randomName(),
		lastName: randomName(),
		password: randomValidPassword(),
	});

	expect(response.statusCode).toBe(400);
});

test('POST /users should fail if emailing is not set up', async () => {
	const owner = await Db.collections.User!.findOneOrFail();
	const authOwnerAgent = await utils.createAuthAgent(app, owner);

	const response = await authOwnerAgent.post('/users').send([{ email: randomEmail() }]);

	expect(response.statusCode).toBe(500);
});

test('POST /users should email invites and create user shells', async () => {
	const owner = await Db.collections.User!.findOneOrFail();
	const authOwnerAgent = await utils.createAuthAgent(app, owner);

	const {
		user,
		pass,
		smtp: { host, port, secure },
	} = await utils.getSmtpTestAccount();

	config.set('userManagement.emails.mode', 'smtp');
	config.set('userManagement.emails.smtp.host', host);
	config.set('userManagement.emails.smtp.port', port);
	config.set('userManagement.emails.smtp.secure', secure);
	config.set('userManagement.emails.smtp.auth.user', user);
	config.set('userManagement.emails.smtp.auth.pass', pass);

	const payload = TEST_EMAILS_TO_CREATE_USER_SHELLS.map((e) => ({ email: e }));

	const response = await authOwnerAgent.post('/users').send(payload);

	expect(response.statusCode).toBe(200);

	for (const { id, email: receivedEmail } of response.body.data) {
		expect(validator.isUUID(id)).toBe(true);
		expect(TEST_EMAILS_TO_CREATE_USER_SHELLS.some((e) => e === receivedEmail)).toBe(true);

		const user = await Db.collections.User!.findOneOrFail(id);
		const { firstName, lastName, personalizationAnswers, password, resetPasswordToken } = user;

		expect(firstName).toBeNull();
		expect(lastName).toBeNull();
		expect(personalizationAnswers).toBeNull();
		expect(password).toBeNull();
		expect(resetPasswordToken).toBeNull();
	}
});

test('POST /users should fail with invalid inputs', async () => {
	const owner = await Db.collections.User!.findOneOrFail();
	const authOwnerAgent = await utils.createAuthAgent(app, owner);

	config.set('userManagement.emails.mode', 'smtp');

	const invalidPayloads = [
		randomEmail(),
		[randomEmail()],
		{},
		[{ name: randomName() }],
		[{ email: randomName() }],
	];

	for (const invalidPayload of invalidPayloads) {
		const response = await authOwnerAgent.post('/users').send(invalidPayload);
		expect(response.statusCode).toBe(400);
	}
});

test('POST /users should ignore an empty payload', async () => {
	const owner = await Db.collections.User!.findOneOrFail();
	const authOwnerAgent = await utils.createAuthAgent(app, owner);

	config.set('userManagement.emails.mode', 'smtp');

	const response = await authOwnerAgent.post('/users').send([]);

	const { data } = response.body;

	expect(response.statusCode).toBe(200);
	expect(Array.isArray(data)).toBe(true);
	expect(data.length).toBe(0);
});

// TODO: UserManagementMailer is a singleton - cannot reinstantiate with wrong creds
// test('POST /users should error for wrong SMTP config', async () => {
// 	const owner = await Db.collections.User!.findOneOrFail();
// 	const authOwnerAgent = await utils.createAuthAgent(app, owner);

// 	config.set('userManagement.emails.mode', 'smtp');
// 	config.set('userManagement.emails.smtp.host', 'XYZ'); // break SMTP config

// 	const payload = TEST_EMAILS_TO_CREATE_USER_SHELLS.map((e) => ({ email: e }));

// 	const response = await authOwnerAgent.post('/users').send(payload);

// 	expect(response.statusCode).toBe(500);
// });

const INITIAL_TEST_USER = {
	id: uuid(),
	email: randomEmail(),
	firstName: randomName(),
	lastName: randomName(),
	password: randomValidPassword(),
};

const INVALID_FILL_OUT_USER_PAYLOADS = [
	{
		firstName: randomName(),
		lastName: randomName(),
		password: randomValidPassword(),
	},
	{
		inviterId: INITIAL_TEST_USER.id,
		firstName: randomName(),
		password: randomValidPassword(),
	},
	{
		inviterId: INITIAL_TEST_USER.id,
		firstName: randomName(),
		password: randomValidPassword(),
	},
	{
		inviterId: INITIAL_TEST_USER.id,
		firstName: randomName(),
		lastName: randomName(),
	},
	{
		inviterId: INITIAL_TEST_USER.id,
		firstName: randomName(),
		lastName: randomName(),
		password: randomInvalidPassword(),
	},
];

const TEST_EMAILS_TO_CREATE_USER_SHELLS = [randomEmail(), randomEmail(), randomEmail()];
