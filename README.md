[![nlm-github](https://img.shields.io/badge/github-groupon%2Fnilo%2Fissues-F4D03F?logo=github&logoColor=white)](https://github.com/groupon/nilo/issues)
![nlm-node](https://img.shields.io/badge/node-%3E%3D10.13-blue?logo=node.js&logoColor=white)
![nlm-version](https://img.shields.io/badge/version-4.0.8-blue?logo=version&logoColor=white)
# `nilo` ("ex nihilo")

> Ex nihilo is a Latin phrase meaning "out of nothing".
> It often appears in conjunction with the concept of creation,
> as in creatio ex nihilo, meaning "creation out of nothing"—chiefly in philosophical
> or theological contexts, but also occurs in other fields.
>
> — [Wikipedia](https://en.wikipedia.org/wiki/Ex_nihilo)

A dependency injection toolset for building applications.
In most cases this wouldn't be used directly but via a framework.

```js
const { App, main } = require('nilo');

const app = new App();
main(app);
```

## Concepts

* **Scope:** A set of dependency definitions
  for objects that share a lifecycle.
  E.g. the `singleton` scope is for objects that are created once
  while objects in the `request` scope are created for each request.
  Scopes can be nested which means that objects in the `request` scope
  may depend on objects in the `singleton` scope but not vice versa.
* **Injector:** An instance of a scope, holding the individual objects.
  For each request there will be exactly one injector for the `request` scope.
* **Key:** An id that is used to request a dependency.

## Usage

*The rest of the docs will use `singleton->xyz` as a shorthand for*
*"the dependency with key `xyz` provided in the `singleton` scope".*

```js
const {
  Project, // the project on disk, allows loading files etc.
  Registry, // DI dependency registration
  App, // running application, includes instances of Project and Registry
  main, // run CLI command for an app
} = require('nilo');
```

### App

The `App` class brings all the other pieces together.
It is the primary interface of `nilo`.

* `app.appDirectory`: The root directory of this app.
* `app.project`: The `Project` for this app.
* `app.registry`: The `Registry` for this app.

#### `new App(appDirectory, frameworkDirectory)`

#### `app.initialize(): Promise<void>`

Loads `object-graph` interface files which are used to declare dependencies.
The default export of each file is expected to be a function
that will be invoked with the `registry`.
Example:

```js
module.exports = registry => {
  registry.singleton.setFactory('answer', null, () => 42);
};
```

#### `app.configure(): Promise<void>`

Runs the following steps:

1. Run `app.initialize()` if it hasn't happened yet.
1. Run `singleton->configure[]` hooks. Their job is to make sure that the config is available.
1. Run `singleton->afterConfigure[]` hooks.
   These are basic bootstrapping hooks that may require configuration to be available.
   None of them should be specific to a particular kind of app.

#### Standard Dependencies

##### `singleton->app`

The `app` instance that is currently running.

##### `singleton->project`

The `project` used to load modules.

##### `singleton->registry`

The `registry` used to register dependencies.

### Project

A collection of helpers that can be used to load additional files
relative to the app's root directory.

#### `new Project(appDirectory, frameworkDirectory)`

* `appDirectory`: The app's root directory.
* `frameworkDirectory`: The directory of the framework.
  When methods refer to "bundled" dependencies,
  they're talking about dependencies loaded from here.
  This can be convenient to handle `npm link` correctly.

#### `project.loadInterfaceFiles(basename: string)`

Interface files are files that follow a specific naming convention
and are found in well-known locations:

* `{lib,modules}/*/$basename.{js,mjs}`
* For each `dependencies` `$key` in `package.json`,
  from `$key/$basename`.
* Outside of `NODE_ENV=production` also for each `devDependencies` key.

This function returns an array with one entry for each interface file:

* `moduleNamespace`: The namespace record for the file.
* `defaultExport`: Convenience property for `moduleNamespace.default`.
* `specifier`: The specifier the file was loaded from,
  relative to the app's root directory.
* `group`: The directory the file was found in.

Note that `.mjs` file support requires you to be using a version of node with
builtin support for ES Modules.  Currently this is Node 10+ with
the `--experimental-modules` flag.  Node 10.x seems to experience
segfaults under certain conditions, so we recommend 12+.

### Registry

A set of three scopes, in order of nesting:

* `singleton`: Scope for objects that are created once and then reused.
* `request`: Scope for objects that are created for each request.
* `action`: Scope for ephemeral objects that are created for one aspect
  of handling a request.

#### `DependencyQuery`

A dependency query is either a string or a `DependencyDescriptor` object.
They are used both when asking for a dependency (*ask for*) and when providing
one (*provide*). The following kinds of dependency queries are recognized,
each assuming that the resulting dependency is called `x`:

* `x`: A required dependency (*provide* or *ask for*).
  It is expected to be provided exactly once.
  Descriptor: `{ key: 'x' }`.
* `x?`: An optional dependency (*ask for* only).
  If it is provided, it is expected to be provided exactly once.
  Descriptor: `{ key: 'x', optional: true }`.
* `x[]`: Getting all values of a multi-valued dependency (*ask for* only).
  It may be provided multiple times and all will be injected as an array.
  Descriptor: `{ key: 'x', multiValued: true }`.
* `x[y]`: A specific element of a multi-valued dependency with a unique `index` (*provide* or *ask for*).
  When providing a multi-valued dependency, this form has to be used.
  Descriptor: `{ key: 'x', multiValued: true, index: 'y' }`.

#### `registry.getProviderGraph()`

Returns a structured object with information about all registered providers,
where they have been registered, and what their dependencies are.
This data can be used to provide inspection and other developer tooling.

#### `registry.getSingletonInjector()`

Creates an `Injector` for the `singleton` scope.
The injector returned will always be the same instance.

#### `registry.getRequestInjector(request, response)`

Creates an `Injector` for the `request` scope.
Both `'request'` and `'response'` will be available as dependencies.
For the same `request`, it will return the same injector instance.

#### `registry.getActionInjector(request, response, action)`

Creates an `Injector` for the `action` scope,
based on the `request` injector for the given `request` object.
In addition to `'request'` and `'response`',
`'action'` will be as a dependency.
It will always return a new injector.

For testing or trivial uses, you may omit all of the arguments to be given
empty default values.

#### `Registry.from(([scope, name, value] | (registry) => void)[]): Registry`

Sometimes you might wish to create a registry from scratch, all-at-once,
particularly when testing.  In this case, you may call the static method
`Registry.from()`, passing it an array which contains items, each of which
is either:

* an tuple specifying a static entry on the specified `scope`
* a function which accepts the `registry` being constructed and makes whatever
    calls on it it likes

This lets you do something like this:

```js
const deps = Registry.from([
  ['singleton', 'x', 42],
  ['request', 'y', 88],
  require('../one/object-graph'),
  require('../another/object-graph'),
]).getActionInjector().getProvider();
// ^ this is a slightly neater way of doing something like:
const reg = new Registry();
reg.singleton.setValue('x', 42);
reg.request.setValue('y', 42);
require('../one/object-graph')(reg);
require('../another/object-graph')(reg);
const deps = reg.getActionInjector().getProvider();
```

#### `injector.get(key)`

Resolve the dependency specified the `DependencyQuery` in `key`
and return the resulting object.

```js
registry.singleton.setFactory('x', null, () => 'x-value');
const injector = registry.getSingletonInjector();
const x = injector.get('x');
x === 'x-value';
const y = injector.get('y?');
y === null;
// throws because `y` hasn't been provided:
injector.get('y');
```

For multi-valued dependencies,
the result will be an array with named properties for each `index`.
Example:

```js
registry.singleton.setFactory('x[a]', null, () => 'a-value');
registry.singleton.setFactory('x[b]', null, () => 'b-value');
const x = registry.getSingletonInjector().get('x[]');
x[0] === x.a && x.a === 'a-value';
x[1] === x.b && x.b === 'b-value';
```

#### `injector.keys()`

Returns an array of all registered dependency keys that could be created using this `injector`.

#### `injector.getProvider()`

Get a magical proxy object that can be used to read dependencies.
While very convenient, it should be used sparingly.
Roughly speaking, reading properties from the provider is equivalent of passing the key to `injector.get`.

#### `scope.setFactory(key, deps, factory)`

* `key`: A `DependencyQuery` that this factory can fulfil.
* `deps`: An array of `DependencyQuery`s that this factory depends on.
  If there are no dependencies, it may be `null`.
* `factory`: A function that takes an object with the fulfilled dependencies.

```js
registry.singleton.setFactory(
  'projectRootLength',
  ['project'],
  ({ project }) => project.root.length
);

registry.singleton.setFactory('pid', null, () => process.pid);
```

#### `scope.setValue(key, value)`

A convenience method for when a factory would always return the same value,
especially handy for things in the `singleton` scope.

### `main(app, defaultCommand = 'start', argv = process.argv)`

1. Run `app.initialize()`.
1. Discover all available commands from `singleton->commands[]`.
1. Parse CLI options and run selected command, defaulting to `defaultCommand`.
1. Exit once the command resolves.
