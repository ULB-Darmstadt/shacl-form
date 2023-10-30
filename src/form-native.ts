import { ShaclForm } from "./form"
import { NativeTheme } from "./themes/native"

export class ShaclFormElement extends ShaclForm {
    constructor() {
        super(new NativeTheme())
    }
}

window.customElements.define('shacl-form', ShaclFormElement)
