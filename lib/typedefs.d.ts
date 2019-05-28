import { IncomingMessage, ServerResponse } from 'http';

type DependencyDescriptor = {
  key: string | symbol,
  index?: string,
  optional?: boolean,
  multiValued?: boolean,
};

type DependencyQuery = DependencyDescriptor | string | symbol;

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

type SimpleProviderNode = {
  key: string | symbol,
  multiValued: false,
};

type MultiValuedProviderNode = {
  key: string | symbol,
  multiValued: true,
  indices: Map<string, SimpleProviderNode>,
};

type ProviderNode = SimpleProviderNode | MultiValuedProviderNode;

type ScopeNode = {
  name: string,
  providers: Map<string | symbol, ProviderNode>,
  children: ScopeNode[],
};

declare class Scope {
  constructor(name: string);

  readonly name: string;

  setFactory<T>(query: string | symbol, deps: string[] | null, factory: (deps?: any) => T): void;
  setValue<T>(query: string | symbol, value: T): void;

  createInjector(init: Map<any, any>, parent?: Injector): Injector;
  getCachedInjector(target: object): Injector;
  getCachedInjector(target: object, init: Map<any, any>, parent: Injector): Injector;
  create<T>(key: string | symbol, injector: Injector): T;

  has(key: string | symbol): boolean;
  getKeys(): (string | symbol)[];
  getOwnMultiValuedProviders(key: string | symbol): MultiValuedDependencyProvider;

  getProviderNodes(): Map<string | symbol, ProviderNode>;
}

type Provider = {
  get(query: DependencyQuery): unknown;
  keys(): (string | symbol)[];

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

export type ScopeEntry =
  [ 'singleton' | 'request' | 'action', string, any ] |
  ((registry: Registry) => void);

export class Registry {
  readonly singleton: Scope;
  readonly request: Scope;
  readonly action: Scope;

  static from(decls: ScopeEntry[]): Registry;

  getSingletonInjector(): Injector;
  getRequestInjector(request?: IncomingMessage, response?: ServerResponse): Injector;
  getActionInjector(request?: IncomingMessage, response?: ServerResponse, action?: any): Injector;

  getProviderGraph(): ScopeNode;
}

type CommandConfig<OptionsType> = {
  name: string;
  description: string;
  init: (cmd: import('commander').Command) => void;
  action: (app: App, options: OptionsType, ...args: any[]) => Promise<number | void>;
};

export function main(app: App, defaultCommand?: string, argv?: string[]): Promise<void>;
