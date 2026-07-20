declare module '*.css?raw'
declare module '*.svg?url' {
    const url: string
    export default url
}
declare module 'shacl-engine'
