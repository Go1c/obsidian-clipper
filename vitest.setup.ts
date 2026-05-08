import { parseHTML } from 'linkedom';

class LinkedomDOMParser {
	parseFromString(html: string) {
		return parseHTML(html).document;
	}
}

const { document, window } = parseHTML('<!doctype html><html><body></body></html>');

globalThis.window = globalThis as Window & typeof globalThis;
globalThis.document = document as unknown as Document;
globalThis.DOMParser = LinkedomDOMParser as unknown as typeof DOMParser;
globalThis.window.DOMParser = LinkedomDOMParser as unknown as typeof DOMParser;
globalThis.Node = window.Node;
globalThis.Element = window.Element;
globalThis.HTMLElement = window.HTMLElement;
globalThis.Document = window.Document;
