### 4.0.0

#### Breaking Changes

now if you want to use `.mjs` files, you should run
with `NODE_OPTIONS=--experimental-modules` on Node 12.x+.  Also, native
ES module loading is NOT compatible with coffeescript/register

*See: [`cd5f669`](https://github.com/groupon/nilo/commit/cd5f669a1cdae3e43877d581e2e0dcf52a57ec98)*

Node 8.x is no longer supported

*See: [`d50a30b`](https://github.com/groupon/nilo/commit/d50a30bd0f5f4b7da4e96017b5aa937608cf973c)*

#### Commits

* stop using `esm` for ES module loading - **[@dbushong](https://github.com/dbushong)** [#14](https://github.com/groupon/nilo/pull/14)
  - [`cd5f669`](https://github.com/groupon/nilo/commit/cd5f669a1cdae3e43877d581e2e0dcf52a57ec98) **refactor:** switch from standard-things/esm to native - see: [#11](https://github.com/groupon/nilo/issues/11)
  - [`2c30ee4`](https://github.com/groupon/nilo/commit/2c30ee44a491e5bb667be0114f09b97cb486f4d1) **chore:** fix tests
  - [`83e2d7d`](https://github.com/groupon/nilo/commit/83e2d7d9e741e75aaca6bf01870e8f81b1adf497) **chore:** cleanup travis.yml
  - [`a447de8`](https://github.com/groupon/nilo/commit/a447de84f039c2c2c1dc80dbe254f09aec6a7b8f) **fix:** node8 support
  - [`5608968`](https://github.com/groupon/nilo/commit/560896837e94b0a714e9efc830a06750b2000932) **docs:** clarify mjs support
  - [`f4ef49c`](https://github.com/groupon/nilo/commit/f4ef49c44b94d60e1477eb2c1c8db05027a27ae4) **chore:** travis: cleanup run conditions
  - [`66f1b17`](https://github.com/groupon/nilo/commit/66f1b179c4fcebb922dc63ba8a59493c3e98e920) **test:** fix order of assert.equal() calls
  - [`d50a30b`](https://github.com/groupon/nilo/commit/d50a30bd0f5f4b7da4e96017b5aa937608cf973c) **fix:** make node 12 work by using createRequire
  - [`9b5b703`](https://github.com/groupon/nilo/commit/9b5b7035c0218b33ff2909a65bf439adde2aaf40) **fix:** node12 inspection of provider - see: [26241](See: https://github.com/nodejs/node/pull/26241)


### 3.6.2

* chore: Bump eslint-utils from 1.3.1 to 1.4.2 - **[@dependabot[bot]](https://github.com/apps/dependabot)** [#13](https://github.com/groupon/nilo/pull/13)
  - [`11a5eed`](https://github.com/groupon/nilo/commit/11a5eed3a9c2557c197932e1551f2dc9e9c96d7b) **chore:** Bump eslint-utils from 1.3.1 to 1.4.2


### 3.6.1

* Bump lodash from 4.17.11 to 4.17.13 - **[@dependabot[bot]](https://github.com/apps/dependabot)** [#12](https://github.com/groupon/nilo/pull/12)
  - [`563f18a`](https://github.com/groupon/nilo/commit/563f18af28ef4d5e40670caab0c9af9c0807d699) **chore:** Bump lodash from 4.17.11 to 4.17.13 - see: [4](- [Commits](https://github.com/lodash/lodash/compare/4)


### 3.6.0

* add `key` property to dep key errs - **[@dbushong](https://github.com/dbushong)** [#10](https://github.com/groupon/nilo/pull/10)
  - [`2fa6230`](https://github.com/groupon/nilo/commit/2fa6230fb331b9e64fe9a34ec64c11cc4b268cb5) **feat:** add `key` property to dep key errs


### 3.5.0

* Registry.from() - **[@dbushong](https://github.com/dbushong)** [#9](https://github.com/groupon/nilo/pull/9)
  - [`456f3db`](https://github.com/groupon/nilo/commit/456f3db8bbdb96090f2032860b7d1bdeba81b94f) **chore:** npm audit fix
  - [`67bc6e9`](https://github.com/groupon/nilo/commit/67bc6e95bafb7176eaf70f621da26765a6d47b0b) **feat:** add Registry.from()
  - [`bf3c2f2`](https://github.com/groupon/nilo/commit/bf3c2f29a5454566697458d866066fffc59e19ef) **refactor:** typofix variable name


### 3.4.0

* Convenience API to set an instance - **[@jkrems](https://github.com/jkrems)** [#8](https://github.com/groupon/nilo/pull/8)
  - [`ee9b56a`](https://github.com/groupon/nilo/commit/ee9b56a30de7de62f5fed566b32e757df10f9f49) **feat:** Convenience API to set an instance


### 3.3.0

* Expose object-graph info - **[@jkrems](https://github.com/jkrems)** [#7](https://github.com/groupon/nilo/pull/7)
  - [`71583bb`](https://github.com/groupon/nilo/commit/71583bbf0f7c6806e54b04bacdf9043721d13595) **feat:** Expose object-graph info
  - [`81c19d6`](https://github.com/groupon/nilo/commit/81c19d60fcd10bab25833f6e3ffe249a485ef23b) **feat:** Add example CLI command for provider info


### 3.2.0

* Support symbols and support inspection - **[@jkrems](https://github.com/jkrems)** [#6](https://github.com/groupon/nilo/pull/6)
  - [`2f8e1de`](https://github.com/groupon/nilo/commit/2f8e1de38d2627e3d663ceea094722941980616a) **feat:** Support symbols and support inspection


### 3.1.0

* Expose types - **[@jkrems](https://github.com/jkrems)** [#5](https://github.com/groupon/nilo/pull/5)
  - [`9383ded`](https://github.com/groupon/nilo/commit/9383dedad0538bbb29e3f45045ed4582db1e6efb) **feat:** Expose types
  - [`9a3163d`](https://github.com/groupon/nilo/commit/9a3163d4118f575b0ed452cb3f003c2c70f3ead1) **style:** Cast on export instead of on import


### 3.0.0

#### Breaking Changes

This pretty much replaces the entire implementation.
Many of the general concepts are preserved but this is what those
ideas evolved into over the past few years.

*See: [`7fae5d4`](https://github.com/groupon/nilo/commit/7fae5d46ea28f6dc3bfc7dbcfa243807041d7ce8)*

#### Commits

* Drop decorators, add new APIs - **[@jkrems](https://github.com/jkrems)** [#4](https://github.com/groupon/nilo/pull/4)
  - [`7fae5d4`](https://github.com/groupon/nilo/commit/7fae5d46ea28f6dc3bfc7dbcfa243807041d7ce8) **refactor:** Drop decorators, add new APIs
