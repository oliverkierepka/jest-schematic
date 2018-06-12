import {
  JsonParseMode,
  experimental,
  parseJson,
  join,
  Path,
} from '@angular-devkit/core';
import {
  SchematicsException,
  Tree,
  SchematicContext,
} from '@angular-devkit/schematics';
import { readPackageJson, pkgJson, DeleteNodeDependency } from './dependencies';
import {
  findPropertyInAstObject,
  appendPropertyInAstObject,
} from './json-utils';

export enum Paths {
  AngularJson = './angular.json',
}

export type WorkspaceSchema = experimental.workspace.WorkspaceSchema;

export interface JestOptions {
  updateTests?: boolean;
  project?: string;
}

export function getWorkspacePath(host: Tree): string {
  const possibleFiles = ['/angular.json', '/.angular.json'];
  const path = possibleFiles.filter((path) => host.exists(path))[0];

  return path;
}

export function getWorkspace(host: Tree): WorkspaceSchema {
  const path = getWorkspacePath(host);
  const configBuffer = host.read(path);
  if (configBuffer === null) {
    throw new SchematicsException(`Could not find (${path})`);
  }
  const content = configBuffer.toString();

  return (parseJson(content, JsonParseMode.Loose) as {}) as WorkspaceSchema;
}

export function getSourcePath(tree: Tree, options: any): String {
  const workspace = getWorkspace(tree);

  if (!options.project) {
    throw new SchematicsException('Option "project" is required.');
  }

  const project = workspace.projects[options.project];

  if (project.projectType !== 'application') {
    throw new SchematicsException(
      `AddJest requires a project type of "application".`
    );
  }

  // const assetPath = join(project.root as Path, 'src', 'assets');
  const sourcePath = join(project.root as Path, 'src');

  return sourcePath;
}

// modified version from utility/dependencies/getPackageJsonDependency
export function removePackageJsonDependency(
  tree: Tree,
  dependency: DeleteNodeDependency
): void {
  const packageJsonAst = readPackageJson(tree);
  const depsNode = findPropertyInAstObject(packageJsonAst, dependency.type);
  const recorder = tree.beginUpdate(pkgJson.Path);

  if (!depsNode) {
    // Haven't found the dependencies key.
    new SchematicsException('Could not find the package.json dependency');
  } else if (depsNode.kind === 'object') {
    const fullPackageString = depsNode.text
      .split('\n')
      .filter((pkg) => {
        return pkg.includes(`"${dependency.name}"`);
      })[0]
      .trim();

    const commaDangle = fullPackageString.slice(-1) === ',' ? 1 : 0;
    const packageAst = depsNode.properties.find(
      (node) => node.key.value === dependency.name
    );

    // TODO: does this work for the last dependency?
    const newLineIndentation = 5;

    if (packageAst) {
      // Package found, remove it.
      const end = packageAst.end.offset + commaDangle;

      recorder.remove(
        packageAst.key.start.offset,
        end - packageAst.start.offset + newLineIndentation
      );
    }
  }

  tree.commitUpdate(recorder);
}

export function safeFileDelete(tree: Tree, path: string): boolean {
  if (tree.exists(path)) {
    tree.delete(path);
    return true;
  } else {
    return false;
  }
}

export function addPropertyToPackageJson(
  tree: Tree,
  context: SchematicContext,
  propertyName: string,
  propertyValue: {}
) {
  const packageJsonAst = readPackageJson(tree);
  const jestNode = findPropertyInAstObject(packageJsonAst, propertyName);
  const recorder = tree.beginUpdate(pkgJson.Path);

  if (!jestNode) {
    // jest node missing, add key/value
    appendPropertyInAstObject(
      recorder,
      packageJsonAst,
      propertyName,
      propertyValue,
      4
    );
  } else if (jestNode.kind === 'object') {
    // jest property exists, update values
    // TODO: --write flag to overwrite properties
    context.logger.warn(
      `Attempted to update package.json but the jest key already exists. Jest object should contain the following...\n${JSON.stringify(
        propertyValue,
        null,
        4
      )}`
    );
  }

  tree.commitUpdate(recorder);
}