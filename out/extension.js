"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const customEditor_1 = require("./view/customEditor");
function activate(context) {
    context.subscriptions.push(customEditor_1.XdebugProfileReadonlyEditorProvider.register(context));
}
function deactivate() { }
//# sourceMappingURL=extension.js.map