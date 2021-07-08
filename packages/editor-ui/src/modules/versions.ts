import { getNextVersions } from '@/api/versions';
import { ActionContext, Module } from 'vuex';
import {
	IRootState,
	IVersion,
	IVersionsState,
} from '../Interface';

const module: Module<IVersionsState, IRootState> = {
	namespaced: true,
	state: {
		versionNotificationSettings: {
			enabled: false,
			endpoint: '',
			infoUrl: '',
		},
		nextVersions: [],
		currentVersion: undefined,
	},
	getters: {
		hasVersionUpdates(state: IVersionsState) {
			return state.nextVersions.length > 0;
		},
		nextVersions(state: IVersionsState) {
			return state.nextVersions;
		},
		currentVersion(state: IVersionsState) {
			return state.currentVersion;
		},
		areNotificationsEnabled(state: IVersionsState) {
			return state.versionNotificationSettings.enabled;
		},
		infoUrl(state: IVersionsState) {
			return state.versionNotificationSettings.infoUrl;
		},
	},
	mutations: {
		setVersions(state: IVersionsState, {versions, currentVersion}: {versions: IVersion[], currentVersion: string}) {
			state.nextVersions = versions.filter((version) => version.name !== currentVersion);
			state.currentVersion = versions.find((version) => version.name === currentVersion);
		},
		setVersionNotificationSettings(state: IVersionsState, settings: {enabled: true, endpoint: string, infoUrl: string}) {
			state.versionNotificationSettings = settings;	
		},
	},
	actions: {
		async fetchVersions(context: ActionContext<IVersionsState, IRootState>) {
			const enabled = context.state.versionNotificationSettings.enabled;
			if (enabled) {
				const currentVersion = context.rootState.versionCli;
				const versions = await getNextVersions(context.state.versionNotificationSettings.endpoint, currentVersion);
				context.commit('setVersions', {versions, currentVersion});
			}
		},
	},
};

export default module;