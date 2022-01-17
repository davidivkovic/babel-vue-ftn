/*
  Config for https://www.npmjs.com/package/babel-plugin-transform-imports
*/
const importOptions = {
  'vue': {
    transform: '/modules/vue@3.2.21.esm.min.prod.js',
    skipDefaultConversion: true
  },
  '@vue/devtools-api': {
    transform: '/modules/vue-devtools-api@6.0.0.esm.min.js',
    skipDefaultConversion: true
  },
  'vue-router': {
    transform: '/modules/vue-router@4.0.12.esm.min.js',
    skipDefaultConversion: true
  },
  '@headlessui/vue': {
    transform: '/modules/headlessui-vue@1.4.2.esm.min.js',
    skipDefaultConversion: true
  },
  '@heroicons/vue\/[^\/]*$': {
    transform: (importName, matches) => `/modules/${matches[0]}/${importName}.js`,
    skipDefaultConversion: false
  },
  'date-fns': {
    transform: '/modules/date-fns@2.26.0.esm.min.js',
    skipDefaultConversion: true
  },
  'axios': {
    transform: '/modules/axios@0.24.0.esm.min.js',
    skipDefaultConversion: true
  },
  'vee-validate': {
    transform: '/modules/vee-validate@4.5.6.esm.min.js',
    skipDefaultConversion: true
  },
  '@vee-validate/rules': {
    transform: '/modules/vee-validate-rules@4.5.6.esm.min.js',
    skipDefaultConversion: true
  }
}

/*
  Specify modules to be excluded from import transforms.
  These should be 'leaves' of the dependency graph.
  They should have no dependencies themselves.
  This is a performance optimization.
*/
const excludedLibraries = [
  'vue@3.2.21.esm.min.prod.js',
  'tailwind@3.0.0-alpha.2.js',
  'date-fns@2.26.0.esm.min.js'
]

export {
  importOptions,
  excludedLibraries
}