import { Plugin, PluginOptions } from '../plugin'
import { Term } from '@rdfjs/types'

import { ShaclPropertyTemplate } from '../property-template'
import {  InputListEntry } from '../theme'

export class FileUploadPlugin extends Plugin {   
  	onChange: any
    constructor(options: PluginOptions, onChange: (event: any) => void, fileType?: string) {
        super(options)
      	this.onChange = onChange
    }

    createEditor(template: ShaclPropertyTemplate, value?: Term ): HTMLElement {
        const required = template.minCount !== undefined && template.minCount > 0
        let editor
        editor = document.createElement('input')
        editor.type = 'file'
        if (fileType)
          editor.setAttribute('accept', filetype) 
      	editor.addEventListener('change', this.onChange);

        return template.config.theme.createDefaultTemplate(
        	template.label,
        	value || null,
        	required,
        	editor,
        	template)
    }
}
