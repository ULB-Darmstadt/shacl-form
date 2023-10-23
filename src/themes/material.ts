import { ShaclPropertyTemplate } from '../property-template'
import '@fontsource/roboto'

import { Term } from '@rdfjs/types'

import { MdOutlinedTextField } from '@material/web/textfield/outlined-text-field'
import "@fontsource/roboto"
import { NativeTheme } from './native';

export class MaterialTheme extends NativeTheme {
    createText(template: ShaclPropertyTemplate, editMode: boolean, value?: Term): HTMLElement {
        return this.createDefaultTemplate(template, new MdOutlinedTextField(), value)
    }
}