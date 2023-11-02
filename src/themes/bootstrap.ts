import { DefaultTheme } from './default'
import { Term } from '@rdfjs/types'
import { ShaclPropertyTemplate } from '../property-template'
import { Editor } from '../theme'
import bootstrap from 'bootstrap/dist/css/bootstrap.min.css'
import css from './bootstrap.css'

export class BootstrapTheme extends DefaultTheme {
    constructor() {
        super(bootstrap + '\n' + css)
    }

    apply(root: HTMLFormElement): void {
        super.apply(root)
        root.dataset.bsTheme = 'light'
    }

    createDefaultTemplate(label: string, value: Term | null, required: boolean, editor: Editor, template?: ShaclPropertyTemplate | undefined): HTMLElement {
        const result = super.createDefaultTemplate(label, value, required, editor, template)
        if (editor.type !== 'checkbox') {
            result.classList.add('form-floating')
            if (editor.tagName === 'SELECT') {
                editor.classList.add('form-select')
            } else {
                editor.classList.add('form-control')
            }
        }
        const labelElem = result.querySelector('label')
        labelElem?.classList.add('form-label')
        if (labelElem?.title) {
            result.dataset.description = labelElem.title
            labelElem.removeAttribute('title')
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
