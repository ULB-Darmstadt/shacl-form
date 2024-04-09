import { Plugin, PluginOptions } from '../plugin'
import { ShaclPropertyTemplate } from '../property-template'

export class FileUploadPlugin extends Plugin {   
  	onChange: (event: Event) => void
    fileType: string | undefined

    constructor(options: PluginOptions, onChange: (event: Event) => void, fileType?: string) {
        super(options)
      	this.onChange = onChange
        this.fileType = fileType
    }

    createEditor(template: ShaclPropertyTemplate): HTMLElement {
        const required = template.minCount !== undefined && template.minCount > 0
        const editor = template.config.theme.createFileEditor(template.label, null, required, template)
      	editor.addEventListener('change', event => {
          event.stopPropagation()
          this.onChange(event)
        })
        if (this.fileType) {
          editor.querySelector('input[type="file"]')?.setAttribute('accept', this.fileType)
        }
        return editor
    }
}
