import { IExecuteFunctions } from 'n8n-core';
import { ICredentialDataDecryptedObject } from '../../../../workflow/dist/src';
import { Property } from '../Common';
import { IIssue } from '../Issue/IssueEntities';
import { getIssue } from '../Issue/IssueRequests';
import { ProjectMovePosition, ProjectOperation, ProjectType } from './ConfigProject';
import { findOrganizationalProject, findRepositoryProject, findUserProject } from './ProjectActions';
import { IProject, IProjectCard, IProjectColumn } from './ProjectEntities';
import { createCard, getCardsOfColumn, getColumns, moveCard } from './ProjectRequests';

export async function orchestrateProjectOperation(
  this: IExecuteFunctions,
  credentials: ICredentialDataDecryptedObject
): Promise<any> {
  const operation = this.getNodeParameter(Property.Operation, 0) as ProjectOperation;
  const projectName = this.getNodeParameter(Property.ProjectName, 0) as string;
  const projectType = this.getNodeParameter(Property.ProjectType, 0) as ProjectType;

  if (operation === ProjectOperation.MoveCard) {
    let matchingProject;

    if (projectType === ProjectType.Organization) {
      const owner = this.getNodeParameter(Property.Owner, 0) as string;
      matchingProject = await findOrganizationalProject.call(this, credentials, owner, projectName) as IProject;
    } else if (projectType === ProjectType.Repository) {
      const owner = this.getNodeParameter(Property.Owner, 0) as string;
      const repository = this.getNodeParameter(Property.Repository, 0) as string;
      matchingProject = await findRepositoryProject.call(this, credentials, owner, repository, projectName) as IProject;
    } else if (projectType === ProjectType.User) {
      const user = this.getNodeParameter(Property.Owner, 0) as string;
      matchingProject = await findUserProject.call(this, credentials, user, projectName) as IProject;
    }

    if (matchingProject) {
      let matchingCard;
      const issueNumber = this.getNodeParameter(Property.IssueNumber, 0) as number;

      const columns = await getColumns.call(this, credentials, matchingProject.id) as IProjectColumn[];
      for (const column of columns) {
        const cards = await getCardsOfColumn.call(this, credentials, column.id) as IProjectCard[];
        matchingCard = cards.find(card => card.content_url.split('/')[7] === issueNumber.toString());
        if (matchingCard) {
          break;
        }
      }

      const columnId = this.getNodeParameter(Property.ProjectColumn, 0) as number;
      if (matchingCard) {
        await moveCard.call(this, credentials, matchingCard.id, columnId, ProjectMovePosition.Bottom);
      } else {
        const owner = this.getNodeParameter(Property.Owner, 0) as string;
        const repository = this.getNodeParameter(Property.Repository, 0) as string;
        const issue = await getIssue.call(this, credentials, owner, repository, issueNumber) as IIssue;
        await createCard.call(this, credentials, columnId, issue.id);
      }
    }
  }
}
