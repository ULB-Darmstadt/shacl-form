import { ShaclForm as FormBase } from "./form"
import { MaterialTheme } from "./themes/material"

export * from './exports'

export class ShaclForm extends FormBase {
    constructor() {
        super(new MaterialTheme())
    }
}

window.customElements.define('shacl-form', ShaclForm)
