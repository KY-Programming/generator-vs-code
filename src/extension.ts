'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import http from 'axios';
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
                vscode.window.showErrorMessage('No file selected. Generate aborted!');
                return;
            }
            const file = files[0];
            vscode.workspace.openTextDocument(file.fsPath).then(result => {
                const content = result.getText();
                let url: string;
                let strictSSL: boolean;
                let noProxy: boolean;
                if (content[0] === '{') {
                    const configuration = JSON.parse(content);
                    if (!configuration.Generator || !configuration.Generator) {
                        vscode.window.showErrorMessage('Configuration has to contain setting Generator.Connection. Generate aborted!');
                        return;
                    }
                    url = configuration.Generator.Connection;
                    strictSSL = configuration.Generator.VerifySsl;
                    noProxy = configuration.Generator.NoProxy;
                }
                else {
                    const start = content.indexOf('<Generator>') + 11;
                    const end = content.indexOf('</Generator>');
                    let generatorNode = content.substring(start, end);
                    while (true) {
                        const commentStart = generatorNode.indexOf('<!--');
                        const commentEnd = generatorNode.indexOf('-->');
                        if (commentStart >= 0) {
                            generatorNode = generatorNode.substring(0, commentStart) + generatorNode.substring(commentEnd + 3);
                        }
                        else {
                            break;
                        }
                    }
                    const connectionStart = generatorNode.indexOf('<Connection>') + 12;
                    const connectionEnd = generatorNode.indexOf('</Connection>');
                    url = generatorNode.substring(connectionStart, connectionEnd).trim();
                    const verifySslStart = generatorNode.indexOf('<VerifySsl>') + 11;
                    const verifySslEnd = generatorNode.indexOf('</VerifySsl>');
                    strictSSL = verifySslEnd === -1 || generatorNode.substring(verifySslStart, verifySslEnd).trim() !== 'false';
                    const noProxyStart = generatorNode.indexOf('<NoProxy>');
                    const noProxyEnd = generatorNode.indexOf('</NoProxy>');
                    const noProxyStandalone = generatorNode.includes('<NoProxy/>') || generatorNode.includes('<NoProxy />');
                    noProxy = noProxyStandalone || noProxyStart >= 0 && generatorNode.substring(noProxyStart + 9, noProxyEnd).trim() !== 'false';
                }
                if (strictSSL === false) {
                    process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = 0;
                }
                let id: string;
                const httpClient = http.create({
                    baseURL: url,
                    proxy: noProxy ? false : undefined
                });
                httpClient.post('/Create', { configuration: content })
                    .then(response => {
                        id = response.data;
                        return httpClient.get('/GetFiles/' + id);
                    })
                    .then(response => {
                        const data = response.data as string;
                        if (!data) {
                            vscode.window.showErrorMessage('The generation is failed with an unkonw error #222d');
                            return;
                        }
                        const filePaths = data.split('\n').filter(x => x).map(x => x.trim());
                        const promises: any[] = [];
                        filePaths.forEach(filePath => {
                            const fullPath = currentDirectory.uri.fsPath + '\\' + filePath;
                            const directory = fullPath.substring(0, fullPath.lastIndexOf('\\'));
                            fs.mkdir(directory);
                            const promise = httpClient.get('/GetFile/' + id + '?path=' + filePath)
                                .then((fileResponse: any) => {
                                    const content = fileResponse.data as string;
                                    const chunks = fullPath.split("\\");
                                    for (let index = 2; index < chunks.length; index++) {
                                        fs.mkdir(fullPath.split("\\").slice(0, index - chunks.length).join("\\"));
                                    }
                                    fs.writeFile(fullPath, content);
                                    vscode.window.showInformationMessage(fullPath + ' updated');
                                });
                            promises.push(promise);
                        });
                        return <any>Promise.all(promises).then(() => filePaths.length);
                    })
                    .then((count: number) => {
                        if (count > 0) {
                            vscode.window.showInformationMessage(count + ' files generated');
                        }
                    })
                    .catch((error: Error) => {
                        let details = '';
                        if (error.message.includes('SSL23_GET_SERVER_HELLO')) {
                            details = 'Try to disable proxy with <Generator><NoProxy />...\r\n\r\n';
                        }
                        vscode.window.showErrorMessage('Can not reach the generator server #231d\r\n' + details + error);
                    });
            });
        });
    });

    context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() {
}