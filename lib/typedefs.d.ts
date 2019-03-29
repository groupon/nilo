import { IncomingMessage, ServerResponse } from 'http';

type DependencyDescriptor = {
  key: string,
  index?: string,
  optional?: boolean,
  multiValued?: boolean,
};

type DependencyQuery = DependencyDescriptor | string;

type PackageJSON = {
  name: string;
  version: string;
  [key: string]: any;
};

type InterfaceFile = {
  specifier: string
  group: string
  defaultExport: any
  moduleNamespace: { [key: string]: any }
};

type SimpleDependencyProvider = (injector: Injector) => unknown;
type MultiValuedDependencyProvider = Map<string, SimpleDependencyProvider>;
type DependencyProvider = SimpleDependencyProvider | MultiValuedDependencyProvider;

declare class Scope {
  constructor(name: string);

  readonly name: string;

  setFactory<T>(query: string, deps: string[] | null, factory: (deps?: any) => T): void;

  createInjector(init: Map<any, any>, parent?: Injector): Injector;
  getCachedInjector(target: object): Injector;
  getCachedInjector(target: object, init: Map<any, any>, parent: Injector): Injector;
  create<T>(key: string, injector: Injector): T;

  has(key: string): boolean;
  getKeys(): string[];
  getOwnMultiValuedProviders(key: string): MultiValuedDependencyProvider;
}

type Provider = {
  get(query: DependencyQuery): unknown;
  keys(): string[];

  [key: string]: unknown;
};

declare class Injector {
  constructor(scope: Scope, init?: Map<string, any>, parent?: Injector);

  get(query: DependencyQuery): unknown;
  getProvider(): Provider;
}

export class App {
  constructor(appDirectory: string, frameworkDirectory: string);

  readonly appDirectory: string;
  readonly project: Project;
  readonly registry: Registry;

  initialize(): Promise<void>;
  configure(): Promise<void>;
  runAll(filter: string): Promise<void>;
}

export class Project {
  constructor(appDirectory: string, frameworkDirectory: string);

  readonly packageJson: PackageJSON;
  readonly root: string;

  requireBundled(specifier: string): any;
  loadInterfaceFiles(basename: string): Promise<InterfaceFile[]>;
}

export class Registry {
  readonly singleton: Scope;
  readonly request: Scope;
  readonly action: Scope;

  getSingletonInjector(): Injector;
  getRequestInjector(request: IncomingMessage, response: ServerResponse): Injector;
  getActionInjector(request: IncomingMessage, response: ServerResponse, action: any): Injector;
}

export function main(app: App, defaultCommand?: string, argv?: string[]): Promise<void>;
