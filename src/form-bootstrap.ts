import { ShaclForm } from "./form"
import { BootstrapTheme } from "./themes/bootstrap"

export class ShaclFormElement extends ShaclForm {
    constructor() {
        super(new BootstrapTheme())
    }
}

window.customElements.define('shacl-form', ShaclFormElement)
