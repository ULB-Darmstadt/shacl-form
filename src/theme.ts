export interface Theme {
    createTextInput(): HTMLElement
}

export class DefaultTheme implements Theme {
    createTextInput(): HTMLElement {
        const elem = document.createElement('input')
        return elem
    }
}

export class BootstrapTheme implements Theme {
    createTextInput(): HTMLElement {
        const elem = document.createElement('input')
        elem.classList.add('form-control')
        return elem
    }
}