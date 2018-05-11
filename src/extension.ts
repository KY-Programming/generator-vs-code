'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
const http = require('axios');
const fs = require("fs");

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('Congratulations, your extension "ky-generator" is now active!');

    // The command has been defined in the package.json file
    // Now provide the implementation of the command with  registerCommand
    // The commandId parameter must match the command field in package.json
    let disposable = vscode.commands.registerCommand('extension.kyGenerate', () => {
        // The code you place here will be executed every time your command is executed
        if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
            vscode.window.showErrorMessage('No workspace/folder opened. Please use File > Open Folder/Workspace first!');
            return;
        }
        const currentDirectory = vscode.workspace.workspaceFolders[0];
        if (vscode.workspace.workspaceFolders.length > 1) {
            vscode.window.showWarningMessage('Multiple projects loaded. Use ' + currentDirectory.name);
        }

        const options = <vscode.OpenDialogOptions>{
            filters: { 'Configuration Files': ['json', 'xml', 'config'] }
        };
        vscode.window.showOpenDialog(options).then(files => {
            if (!files) {
                vscode.window.showErrorMessage('No file selected. Generation aborted!');
                return;
            }
            const file = files[0];
            vscode.workspace.openTextDocument(file.fsPath).then(result => {
                const content = result.getText();
                debugger;
                let url: string;
                if (content[0] === '{') {
                    const configuration = JSON.parse(content);
                    url = configuration.Generator.Connection;
                }
                else {
                    const start = content.indexOf('<Generator>') + 11;
                    const end = content.indexOf('</Generator>');
                    const generatorNode = content.substring(start, end);
                    const connectionStart = generatorNode.indexOf('<Connection>') + 12;
                    const connectionEnd = generatorNode.indexOf('</Connection>');                    
                    url = generatorNode.substring(connectionStart, connectionEnd).trim();
                }
                let id: string;
                http.post(url + '/Create', { configuration: content })
                    .then((response: any) => {
                        id = response.data;
                        return http.get(url + '/GetFiles/' + id);
                    })
                    .then((response: any) => {
                        const data = response.data as string;
                        if (!data) {
                            vscode.window.showErrorMessage('The generation is failed with an unkonw error #222d');
                            return;
                        }
                        const filePaths = data.split('\n').filter(x => x).map(x => x.trim());
                        const promises: any[] = [];
                        filePaths.forEach(filePath => {
                            const fullPath = currentDirectory.uri.fsPath + '\\' + filePath;
                            const promise = http.get(url + '/GetFile/' + id + '?path=' + filePath)
                                .then((fileResponse: any) => {
                                    const content = fileResponse.data as string;
                                    fs.writeFile(fullPath, content);
                                    vscode.window.showInformationMessage(fullPath + ' updated');
                                });
                            promises.push(promise);
                        });
                        return Promise.all(promises);
                    })
                    .then(() => {
                        vscode.window.showInformationMessage('Done');
                    })
                    .catch((error: Error) => {
                        vscode.window.showErrorMessage('Can not reach the generator server #231d\r\n' + error);
                    });
            });
        });
    });

    context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() {
}