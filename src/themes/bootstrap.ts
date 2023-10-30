import { NativeTheme } from './native'
import { Term } from '@rdfjs/types'
import { ShaclPropertyTemplate } from '../property-template'
import { Editor } from '../theme'
import bootstrap from 'bootstrap/dist/css/bootstrap.min.css'
import css from './bootstrap.css'

export class BootstrapTheme extends NativeTheme {
    constructor() {
        super(bootstrap + '\n' + css)
    }

    apply(root: HTMLFormElement): void {
        super.apply(root)
        root.dataset.bsTheme = 'light'
    }

    createDefaultTemplate(label: string, value: Term | null, required: boolean, editor: Editor, template?: ShaclPropertyTemplate | undefined): HTMLElement {
        const result = super.createDefaultTemplate(label, value, required, editor, template)
        result.classList.add('form-floating')
        if (editor.tagName === 'SELECT') {
            editor.classList.add('form-select')
        } else {
            editor.classList.add('form-control')
        }
        const labelElem = result.querySelector('label')
        labelElem?.classList.add('form-label')
        if (labelElem?.title) {
            const flexBreak = document.createElement('div')
            flexBreak.classList.add('flex-break')
            result.appendChild(flexBreak)
            const description = document.createElement('div')
            description.innerText = labelElem.title
            result.appendChild(description)
        }
        
        result.prepend(editor)
        return result
    }

    createButton(label: string, primary: boolean): HTMLElement {
        const button = super.createButton(label, primary)
        button.classList.add('btn', primary ? 'btn-primary' : 'btn-outline-secondary')
        return button
    }
}