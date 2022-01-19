import { transformSync } from '@babel/core'
import babelPluginTransformImports from './babel-plugin-transform-imports/index.js'
import { minify } from "terser"
import dedent from 'dedent-js'
import glob from 'glob'
import fs from 'mz/fs.js'
import prettier from 'prettier'
import beautify from 'js-beautify'
import { dirname, parse } from 'path'
import { fileURLToPath } from 'url'
import chalk from 'chalk'
import commandLineUsage from 'command-line-usage'
import commandLineArgs from 'command-line-args'
import { 
  isObjectExpression,
  objectProperty,
  identifier,
  templateLiteral,
  templateElement,
  isArrowFunctionExpression,
  isCallExpression,
  isImport
} from '@babel/types'
import { 
  parse as parseSFC,
  compileScript,
  compileStyle
} from 'vue/compiler-sfc'
import { exit } from 'process'

const sections = [
  {
    header: 'babel-transform-vue-ftn',
    content: 'Transpiles a vue-cli project into a non-bundled, non node-dependent project.'
  },
  {
    header: 'Options',
    optionList: [
      {
        name: 'input',
        alias: 'i',
        typeLabel: '{underline string}',
        description: 'The root directory of the project to transpile.'
      },
      {
        name: 'output',
        alias: 'o',
        typeLabel: '{underline string}',
        description: `The output directory where the built files will be placed.
                      The default is /dist under the project root.`
      },
      {
        name: 'help',
        alias: 'h',
        description: 'Print this usage guide.',
        type: Boolean
      }
    ]
  }
]
const usage = commandLineUsage(sections)

const optionDefinitions = [
  { name: 'input', alias: 'i', type: String },
  { name: 'output', alias: 'o', type: String },
  { name: 'help', alias: 'h', type: Boolean }
]

const options = commandLineArgs(optionDefinitions)

if (Object.keys(options).length == 0 || options.help){
  console.log(usage)
  exit(1)
} else if (!options.input) {
  console.error('Must specify input directory.')
  exit(1)
}

const cwd = options.input

let importsConfigName = 'imports.config.js'

try {
  fs.statSync(cwd).isDirectory()
} catch {
  console.error(`Directory ${cwd} does not exist`)
  exit(1)
}

let importsConfigPath = `${cwd}/${importsConfigName}`

if (!fs.existsSync(importsConfigPath)) {
  console.error(`No ${chalk.yellow(importsConfigName)} found at project root ${chalk.cyan(cwd)}`)
  exit(1)
}

// Copy the config from the project root because node is retarded and cannot resolve remote
// esm without the project package.json conatining type:module 
// const localImportsConfigPath = dirname(fileURLToPath(import.meta.url)) + '/' + importsConfigName

// fs.copyFileSync(importsConfigPath, localImportsConfigPath)
let { importOptions, excludedLibraries } = await import('./' + importsConfigName)
// fs.rmSync(localImportsConfigPath)

const distPath = 'dist'
let outDirectory = `${cwd}/${distPath}`

if (options.output) {
  outDirectory = options.output
}

const typesToLoad = [
  'vue',
  'js', 
  'jpeg', 
  'jpg', 
  'png', 
  'svg', 
  'json', 
  'ico',
  'woff',
  'woff2', 
  'ttf', 
  'otf'
].join('|')

const aliases = [
  {
    alias: '@/',
    replacement: '/src/'
  }
]

console.time('[ Build finished ]')
console.log()
console.log('[ Building... ]')

const indent = (content, amount) => {
  return content
    .split('\n')
    .map(l => ' '.repeat(amount) + l)
    .join('\n')
}

const hasAliases = importPath => {
  if(importPath) {
    for (const alias of aliases) {
      if (importPath.startsWith(alias.alias)) return true 
    }
  }
  return false
}

const replaceAliases = importPath => {
  if(importPath) {
    aliases.forEach(a => importPath = importPath.replace(a.alias, a.replacement))
  }
  return importPath
}

const renameImports = importPath => {
  if(importPath) {
    const importName = importPath.split('/').pop()
    let replacement = importName.replace('.vue', '.js')
    replaceAliases(replacement)
    return importPath.replace(importName, replacement)
  } 
  return importPath
}

const createDistSubdir = (subdir = '') => {
  if (subdir.startsWith('public')) return
  fs.mkdirSync(`${outDirectory}/${subdir}`, {
    recursive: true
  })
}

const writeToDist = (subdir, data) => {
  fs.writeFileSync(`${outDirectory}/${subdir}`, data)
}

const readFile = (filePath, fileName, fileType) => {
  return fs.readFileSync(`${cwd}/${filePath}/${fileName}${fileType}`)
}

const babelPluginRemoveCssImports = {
  visitor: {
    ImportDeclaration: path => {
      if (path.node.source.value.endsWith('.css')) {
        path.remove()
      }
    }
  }
}

const babelPluginTransformVueTemplate = template => ({
  visitor: {
    ExportDefaultDeclaration: path => {
      const templateProperty = objectProperty(
        identifier('template'),
        templateLiteral(
          [templateElement({ raw: template })],
          []
        )
      )
      if (isObjectExpression(path.node.declaration)) {
        path.node.declaration.properties.unshift(templateProperty)
      }
    }
  }
})

const babelPluginRenameImports = {
  visitor: {
    StringLiteral: path => {
      if (path.node.value.endsWith('.vue')) {
        path.node.value = replaceAliases(renameImports(path.node.value))
      }
    },
    ImportDeclaration: path => {
      if (path.node.source.value === 'axios') {
        path.node.source.value = importOptions.axios.transform
      }
      path.node.source.value = replaceAliases(renameImports(path.node.source.value))
    },
    Function: (path, state) => {
      if (
          isArrowFunctionExpression(path.node) &&
          isCallExpression(path.node.body)     &&
          isImport(path.node.body.callee)
      ) {
        path.node.body.arguments[0].value = replaceAliases(renameImports(path.node.body.arguments[0].value))
      }
    }
  }
}

const babelPluginTransformDirectoryImport = (workDir, subDir, fileTypes) => ({
  visitor: {
    ImportDeclaration: path => {

      let source = path.node.source.value

      const isAliased = hasAliases(source)

      if (source[0] !== '.' && source[0] !== '/' && !isAliased) return

      if (source.startsWith('./')) {
        source = `${workDir}/${subDir}${source.slice(1)}`
      } else {
        source = `${workDir}/${replaceAliases(source)}`
      }


      if (fs.existsSync(source) && fs.lstatSync(source).isDirectory()) {
        const files = fs.readdirSync(source)
        for (const filePath of files) {
          const { name, ext } = parse(filePath)
          if (fileTypes.includes(ext.slice(1))) {
            path.node.source.value = `${path.node.source.value}/${name}${ext}`
          }
        }
      } else {
        const fileName = source.split('/').pop()
        const fileType = fileName.split('.').pop()
        
        if (fileType !== fileName) return // fileType is missing

        source = source.replace(fileName, '')
        const files = fs.readdirSync(source)

        for (const filePath of files) {
          const { name, ext } = parse(filePath)
          if (name === fileName && fileTypes.includes(ext.slice(1))) {
            const finalPath = path.node.source.value.replace(fileName, '')
            path.node.source.value = renameImports(`${finalPath}${fileName}${ext}`)
          }
        }
      }
    }
  }
})

let babelPlugins = [
  babelPluginRenameImports,
  babelPluginRemoveCssImports,
  [babelPluginTransformImports, importOptions]
]

const prettierOptions = {
  parser: 'babel',
  semi: false,
  vueIndentScriptAndStyle: true,
  singleQuote: true,
  arrowParens: 'avoid',
  // printWidth: 200
}

const cssFiles = []

const vueLoader = (filePath, fileName, fileType) => {

  let script = readFile(filePath, fileName, fileType).toString()

  const parsedSfc = parseSFC(script, { filename: fileName })

  const hasScript = !!parsedSfc.descriptor.script

  if (hasScript) {
    script = compileScript(parsedSfc.descriptor, { id: fileName }).content
  } else {
    script = 'export default {}'
  }
  
  const styles = parsedSfc.descriptor.styles[0]
  const hasStyles = !!styles
  
  const compiledStyle = compileStyle({
    id: fileName,
    filename: fileName,
    source: hasStyles && styles.content,
  })
  
  let template = parsedSfc.descriptor.template.content.replace(/`/g, '\`') // escape all backticks
  aliases.forEach(a => template = template.replaceAll(`src="${a.alias}`, `src="${a.replacement}`))
  template = indent(template, 2)
  const css = indent(compiledStyle.code, 2)
  

  const babelScript = transformSync(script, {
    retainLines: false,
    plugins: [
      ...babelPlugins,
      babelPluginTransformDirectoryImport(cwd, filePath, typesToLoad),
      babelPluginTransformVueTemplate(template)
    ]
  })
      
  const prettierCode = prettier.format(babelScript.code, prettierOptions)
  
  writeToDist(`${filePath}/${fileName}.js`, prettierCode)
  if (hasStyles) {
    const finalName = `${filePath}/${fileName}.css`
    cssFiles.push(finalName)
    writeToDist(finalName, dedent(css))
  }
}

const jsLoader = async (filePath, fileName, fileType) => {

  const isSource = filePath.includes('src')

  if (excludedLibraries.includes(fileName + fileType)) {
    const fullPath = `${filePath}/${fileName}${fileType}` 
    return fs.copyFileSync(`${cwd}/${fullPath}`, `${outDirectory}/${fullPath}`)
  }

  const script = readFile(filePath, fileName, fileType)
  let babelScript = transformSync(script, {
    ...(isSource && {
      retainLines: false
    }),
    plugins: [
      ...babelPlugins,
      babelPluginTransformDirectoryImport(cwd, filePath, typesToLoad)
    ]
  })
  babelScript = babelScript.code

  if (isSource) {
    babelScript = prettier.format(babelScript, prettierOptions)
  } else {
    babelScript = (await minify(babelScript)).code
  }

  writeToDist(`${filePath}/${fileName}${fileType}`, babelScript)
}

const assetLoader = (filePath, fileName, fileType) => {
  const fullPath = `${filePath}/${fileName}${fileType}` 
  fs.copyFileSync(`${cwd}/${fullPath}`, `${outDirectory}/${fullPath}`)
}

const iconLoader = (filePath, fileName, fileType) => {
  fs.copyFileSync(`${cwd}/${filePath}/${fileName}${fileType}`, `${outDirectory}/${fileName}${fileType}`)
}

const loaders = [
  {
    test: '.vue',
    use: vueLoader,
  },
  {
    test: '.js',
    use: jsLoader
  },
  {
    test: /\.jpeg|\.jpg|\.png|\.svg|\.json|\.woff2|\.ttf|\.otf/,
    use: assetLoader
  },
  {
    test: '.ico',
    use: iconLoader
  }
]

const buildEntrypoint = () => {
  const stylesheets = cssFiles.map(href => `<link rel="stylesheet" href="/${href}">`).join('\n')
  const html = `
    <!DOCTYPE html>
    <html lang="">
      <head>
        <title></title>
        <meta charset="utf-8">
        <meta http-equiv="X-UA-Compatible" content="IE=edge">
        <meta name="viewport" content="width=device-width,initial-scale=1.0">
        <link rel="icon" href="/favicon.ico">
        <!-- Styles -->
        <link rel="stylesheet" href="/index.css">
        ${stylesheets}
        <!-- Entrypoint -->
        <script type="module" src="/src/main.js"></script>
      </head>
      <body>
        <div id="app"></div>
        <!-- built files will be auto injected -->
      </body>
    </html>
  `
  writeToDist('index.html', beautify.html(html))
}

const filenames = glob.sync(`**/*.?(${typesToLoad})`, {
  cwd,
  ignore: [
    `*.json`,
    `*.js`,
    `.*`,
    `node_modules/**/*`,
    `dist/**/*`,
    `${cwd}/node_modules/**/*`,
    `${cwd}/dist/**/*`
  ]
})

createDistSubdir()

for (const filePath of filenames) {
  const { dir: fileDirectory, name: fileName, ext: fileType } = parse(filePath)
  createDistSubdir(fileDirectory)

  for (const loader of loaders) {
    if (fileType.match(loader.test)) {
      loader.use(fileDirectory, fileName, fileType)
    }
  }
}

buildEntrypoint()

console.timeEnd('[ Build finished ]')
console.log()
console.log(`${chalk.bgHex('#90fa28').black(' DONE ')} Build complete. The dist directory ${chalk.yellowBright(outDirectory.replaceAll('\\', '/'))} is ready to be deployed.`)
console.log()