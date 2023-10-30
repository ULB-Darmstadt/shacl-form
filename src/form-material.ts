import { ShaclForm } from "./form"
import { MaterialTheme } from "./themes/material"

export class ShaclFormElement extends ShaclForm {
    constructor() {
        super(new MaterialTheme())
    }
}

window.customElements.define('shacl-form', ShaclFormElement)
