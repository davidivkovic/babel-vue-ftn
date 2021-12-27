# babel-transform-vue-ftn
Transpiles a vue-cli project into a non-bundled, non node-dependent project.

## Goals
The purpose of this tool is compiling away Single File Components (SFCs) whilst making the resulting 
code look like it was written by hand.

This tool was build to ease development of a Vue project during the course "Web programming" at the Faculty of Technical Sciences.

Our professor forbids using Node.js, so in order to use SFCs and standard vue tooling I developed this tool.

## This project relies on
- [babel.js](https://babeljs.io/)
- [vue/compiler-sfc](https://www.npmjs.com/package/@vue/compiler-sfc)
- [terser](https://github.com/terser/terser)
- [prettier](https://prettier.io/)

## Examples

### Transforming a .js file

Input:

`src/main.js`

```js
import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import './index.css'

const app = createApp(App)

app.use(router)
app.mount('#app')
```

Output:

`dist/src/main.js`
```js
import { createApp } from '/modules/vue@3.2.21.esm.min.prod.js'
import App from './App.js'
import router from './router/index.js'

const app = createApp(App)

app.use(router)
app.mount('#app')
```

`dist/index.html`
```html
...
<head>
    <script type="module" src="src/main.js"></script>
</head>

<body>
    <div id="app"></div>
    <!-- built files will be auto injected -->
</body>
...
```

### Transforming a .vue file (SFC)

Note: All style tags will be extracted into separate `.css` files and eagerly injected into
the `index.html` entrypoint as stylesheets:

`<link rel="stylesheet" href="/src/Component.css">`

Input:

`src/Component.vue`
```js
<template>
  <div>
    <button
      @click="changeColor()"
      :style="{color: msg}"
    >
      {{ msg }}
    </button>
    <input 
      class="red"
      v-model="msg"
      :style="{color: msg}"
    />
    <AcademicCapIcon/>
    <CogIcon/>
    <CameraIcon/>
  </div>
</template>

<script>
import { ref, watch, onMounted } from 'vue'
import { AcademicCapIcon, CogIcon } from '@heroicons/vue/solid'
import { CameraIcon } from '@heroicons/vue/outline'

export default { 
  components: {
    AcademicCapIcon,
    CogIcon,
    CameraIcon
  },
  setup() {
    onMounted(() => console.log('Component Mounted'))

    const counter = ref(0)
    const msg = ref('red')
    
    const setMsg = value => msg.value = value
    const changeColor = () => (counter.value++ % 2 == 0) ? setMsg('yellow') : setMsg('red')
    watch(
      () => msg,
      () => console.log(`Color changed to ${msg.value}`)
    )

    return {
      msg,
      changeColor
    }
  }
}
</script>

<style>
.red {
  color:orange;
}
</style>
```

Output:

`dist/src/Component.js`

```js
import { onMounted, ref, watch } from '/modules/vue@3.2.21.esm.min.prod.js'
import CameraIcon from '/modules/@heroicons/vue/outline/CameraIcon.js'
import AcademicCapIcon from '/modules/@heroicons/vue/solid/AcademicCapIcon.js'
import CogIcon from '/modules/@heroicons/vue/solid/CogIcon.js'

export default {
  template: `  
    <div>
      <button
        @click="changeColor()"
        :style="{color: msg}"
      >
        {{ msg }}
      </button>
      <input 
        class="red"
        v-model="msg"
        :style="{color: msg}"
      />
      <AcademicCapIcon/>
      <CogIcon/>
      <CameraIcon/>
    </div>
  `,
  components: { AcademicCapIcon, CogIcon, CameraIcon },
  setup() {
    onMounted(() => console.log('Component Mounted'))

    const counter = ref(0)
    const msg = ref('red')

    const setMsg = value => (msg.value = value)
    const changeColor = () => counter.value++ % 2 == 0 ? setMsg('yellow') : setMsg('red')
    watch(
      () => msg,
      () => console.log(`Color changed to ${msg.value}`)
    )

    return {
      msg,
      changeColor
    }
  },
}
```

`dist/Component.css`
```css
.red {
  color:orange;
}
```

## Limitations

- Not very modular
- File type loaders have to be changed in code

### Supports:
- Only vue@next
- Only SFC components with 'export default {}'
- Lazily loading components using import()

### Does NOT support:
- Lazily injecting component styles on load
- `<script setup>`
- `<style scoped>`
- bindings in `<style>`


## Configuration

With no module resolution algorithms or bundling available, we have to specify
module replacements manually.

Place this file in your project root.

Example configuration:

`imports.config.js`
```js
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
    transform: '/modules/headlessui-vue@1.4.2.min.js',
    skipDefaultConversion: true
  },
  '@heroicons/vue\/[^\/]*$': {
    transform: (importName, matches) => `/modules/${matches[0]}/${importName}.js`,
    skipDefaultConversion: false
  },
  'date-fns': {
    transform: '/modules/date-fns@2.26.0.esm.min.js',
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
```
## Usage

Print usage:
```console
>> node index.js --help

babel-transform-vue-ftn

  Transpiles a vue-cli project into a non-bundled, non node-dependent project.

Options

  -i, --input string   The root directory of the project to transpile.
  -h, --help           Print this usage guide.
```

Transpile a project:
```console
>> node index.js --input E:\Projects\web

[ Building... ]
[ Build finished ]: 759.051ms

DONE Build complete. The dist directory E:/Projects/web/dist is ready to be deployed.
```