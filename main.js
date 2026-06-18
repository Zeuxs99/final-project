const { app, BrowserWindow, ipcMain, dialog, Menu, Tray, Notification } = require('electron');

app.disableHardwareAcceleration();
const path = require('node:path');
const fs   = require('node:fs');
const { type } = require('node:os');

// userData is always writable on every platform — no permission issues
const notesFilePath = path.join(app.getPath('userData'), 'notes.json');
const settingsFilePath = path.join(app.getPath('userData'), 'settings.json');
let hasUnsavedChanges = false;
let recentFiles = [];


function readNotes() {
    if (!fs.existsSync(notesFilePath)) return [];
    try {
        const raw = fs.readFileSync(notesFilePath, 'utf-8');
        return JSON.parse(raw);
    } catch (err) {
        console.error('[readNotes] parse error:', err);
        return [];
    }
}

function writeNotes(notes) {
    // Atomic-ish: write temp then rename so a crash never corrupts the file
    const tmp = notesFilePath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(notes, null, 2), 'utf-8');
    fs.renameSync(tmp, notesFilePath);
}
function readSettings(){
    if(!fs.existsSync(settingsFilePath)){
        return {
            fontSize: 16,
            darkMode: false
        };
    }
    const raw = fs.readFileSync(settingsFilePath, 'utf-8');
    return JSON.parse(raw);
}

function writeSettings(settings){
    fs.writeFileSync(settingsFilePath, JSON.stringify(settings, null , 2), 'utf-8');
}
//add recent file


function addRecentFiles(filePath) {
    recentFiles = recentFiles.filter(f => f !== filePath); // Remove if already exists

    recentFiles.unshift(filePath); // Add to beginning

    if (recentFiles.length > 5) {
        recentFiles = recentFiles.slice(0, 5); // Keep only 5 most recent
    }

    updateMenu();
}

function updateMenu() {

    const recentFilesMenu = recentFiles.map(file => ({
        label: path.basename(file),

        click: () => {
            const win = BrowserWindow.getAllWindows()[0];

            if (win) {
                win.webContents.send('open-recent-file', file);
            }
        }
    }));

    const menuTemplate = [
        {
            label: 'File',
            submenu: [
                {
                    label: 'New Note',
                    accelerator: 'CmdOrCtrl+N',
                    click: () => {
                        const win = BrowserWindow.getFocusedWindow();
                        if (win) win.webContents.send('menu-new-note');
                    }
                },

                {
                    label: 'Open File',
                    accelerator: 'CmdOrCtrl+O',
                    click: () => {
                        const win = BrowserWindow.getFocusedWindow();
                        if (win) win.webContents.send('menu-open-file');
                    }
                },

                {
                    type: 'separator'
                },

                {
                    label: 'Recent Files',
                    submenu: recentFilesMenu.length
                        ? recentFilesMenu
                        : [{ label: 'No Recent Files', enabled: false }]
                },

                {
                    type: 'separator'
                },

                {
                    label: 'Save',
                    accelerator: 'CmdOrCtrl+S',
                    click: () => {
                        const win = BrowserWindow.getFocusedWindow();
                        if (win) win.webContents.send('menu-save');
                    }
                },

                {
                    label: 'Save As',
                    accelerator: 'CmdOrCtrl+Shift+S',
                    click: () => {
                        const win = BrowserWindow.getFocusedWindow();
                        if (win) win.webContents.send('menu-save-as');
                    }
                }
            ]
        },
        {
            label: 'Help',
            submenu: [
                {
                    label: 'Keyboard Shortcuts',
                    accelerator: 'F1',
                    click: () => {
                        console.log('F1 pressed in main process');
                        const win = BrowserWindow.getFocusedWindow();
                        
                        if (win) {
                            win.webContents.send('show-shortcuts');
                        }
                    }
                }
            ]
        }
    ];

    Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));
}


function createWindow() {
    const win = new BrowserWindow({
        width: 900,
        height: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    win.loadFile('index.html');
    //win.webContents.openDevTools();

    

    win.webContents.on('context-menu', (event, params) => {
        if (params.misspelledWord) {
            const menu = Menu.buildFromTemplate([
                ...params.dictionarySuggestions.map(suggestion => ({
                    label: suggestion,
                    click: () => win.webContents.replaceMisspelling(suggestion)
                })),
                { type: 'separator' },
       
                {
                    label: 'Add to Dictionary',
                    click: () => win.webContents.addWordToSpellCheckerDictionary(params.misspelledWord)
                }
            ]);
            menu.popup();
        }
    });

    win.webContents.once('did-finish-load', () => {
        win.webContents.session.setSpellCheckerLanguages(['en-US']);
    });

    win.on('close', (event) => {
        event.preventDefault();
        win.hide();
    });

    return win;
}

app.whenReady().then(() => {
    createWindow();
    updateMenu();

    

    const iconPath = path.join(__dirname, 'Icon.png');
    if (fs.existsSync(iconPath)) {
        const tray = new Tray(iconPath);
        const trayMenu = Menu.buildFromTemplate([
            {
                label: 'Show App',
                click: () => {
                    const win = BrowserWindow.getAllWindows()[0];
                    if (win) win.show();
                }
            },
            { label: 'Quit', click: () => app.quit() }
        ]);
        tray.setToolTip('Quick Note Taker');
        tray.setContextMenu(trayMenu);
        tray.on('double-click', () => {
            const win = BrowserWindow.getAllWindows()[0];
            if (!win) return;
            win.isVisible() ? win.hide() : win.show();
        });
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// ── IPC Handlers — all outside createWindow so they register exactly once ─────

ipcMain.handle('set-unsaved-changes', (_event, unsaved) => {
    hasUnsavedChanges = unsaved;
});

ipcMain.handle('get-notes', async () => {
    return readNotes();
});

ipcMain.handle('save-note-json', async (_event, note) => {
    try {
        const notes = readNotes();
        const index = notes.findIndex(n => n.id === note.id);
        const now   = new Date().toISOString();

        if (index === -1) {
            notes.push({ ...note, createdAt: now, updatedAt: now });
        } else {
            notes[index] = { ...notes[index], ...note, updatedAt: now };
        }

        writeNotes(notes);
        console.log('[save-note-json] OK ->', notesFilePath);
        return { success: true };
    } catch (err) {
        console.error('[save-note-json] FAILED:', err);
        return { success: false, error: err.message };
    }
});

ipcMain.handle('delete-note', async (_event, id) => {
    try {
        const notes    = readNotes();
        const filtered = notes.filter(n => n.id !== id);
        writeNotes(filtered);
        return { success: true };
    } catch (err) {
        console.error('[delete-note] FAILED:', err);
        return { success: false, error: err.message };
    }
});

ipcMain.handle('new-note', async () => {
    if (!hasUnsavedChanges) return { confirmed: true };

    const result = await dialog.showMessageBox({
        type: 'warning',
        buttons: ['Discard & Start New', 'Keep Editing'],
        defaultId: 1,
        title: 'Start a Fresh Note?',
        message: 'Your current note has unsaved changes. Discard them and create a new note?'
    });

    return { confirmed: result.response === 0 };
});

ipcMain.handle('save-as', async (_event, text) => {
    const result = await dialog.showSaveDialog({
        defaultPath: 'mynote.txt',
        filters: [{ name: 'Text Files', extensions: ['txt'] }]
    });
    if (result.canceled) return { success: false };
    fs.writeFileSync(result.filePath, text, 'utf-8');
    return { success: true, filePath: result.filePath };
});

ipcMain.handle('open-file', async () => {
    const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'Text Files', extensions: ['txt'] }]
    });
    if (result.canceled) return { success: false };

    const filePath = result.filePaths[0];
    const content  = fs.readFileSync(filePath, 'utf-8');
    addRecentFiles(filePath);
    return { success: true, content, filePath };
});

ipcMain.handle('open-recent-file', async (_event, filePath) => {

    
    const content = fs.readFileSync(filePath, 'utf-8');

    addRecentFiles(filePath);

    return { success: true, content, filePath};
    
});

ipcMain.handle('get-settings', async () =>{
    return readSettings();
});

ipcMain.handle('save-settings', async(event, settings) => {
    const current = readSettings();

    const update = {
        ...current, 
        ...settings 
    };

    writeSettings(update);

    return{success: true};
});

ipcMain.handle('move-to-trash', async (_event, id) => {
    console.log('Moving note to trash:', id);

    const notes = JSON.parse(fs.readFileSync(notesFilePath, 'utf-8'));

    const note = notes.find(n => n.id === id);

    if (note) {
        note.deleted = true;
        console.log('Found note, marked as deleted:', note);
    } else {
        console.warn('Note not found to move to trash:', id);
    }
    fs.writeFileSync(notesFilePath, JSON.stringify(notes, null, 2), 'utf-8');
    return notes;
});

ipcMain.handle('restore-note', async (_event, id) => {
    const notes = JSON.parse(fs.readFileSync(notesFilePath, 'utf-8'));
    const note = notes.find(n => n.id === id);
    if (note) {
        note.deleted = false;
    }
    fs.writeFileSync(notesFilePath, JSON.stringify(notes, null, 2), 'utf-8');
    return notes;
});
 
ipcMain.handle('delete-note-permanently', async (_event, id) => {
    let notes = JSON.parse(fs.readFileSync(notesFilePath, 'utf-8'));
    notes = notes.filter(n => n.id !== id);
    fs.writeFileSync(notesFilePath, JSON.stringify(notes, null, 2), 'utf-8');
    return notes;
});