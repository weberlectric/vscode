/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import URI from 'vs/base/common/uri';
import { Registry } from 'vs/platform/registry/common/platform';
import { KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { IWorkbenchActionRegistry, Extensions } from 'vs/workbench/common/actions';
import { EditorInput, IEditorInputFactory, IEditorInputFactoryRegistry, Extensions as EditorInputExtensions } from 'vs/workbench/common/editor';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { KeyMod, KeyChord, KeyCode } from 'vs/base/common/keyCodes';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { DefaultPreferencesEditorInput, PreferencesEditor, PreferencesEditorInput } from 'vs/workbench/parts/preferences/browser/preferencesEditor';
import { KeybindingsEditor, KeybindingsEditorInput } from 'vs/workbench/parts/preferences/browser/keybindingsEditor';
import { OpenGlobalSettingsAction, OpenGlobalKeybindingsAction, OpenGlobalKeybindingsFileAction, OpenWorkspaceSettingsAction, OpenFolderSettingsAction, ConfigureLanguageBasedSettingsAction, OPEN_FOLDER_SETTINGS_COMMAND } from 'vs/workbench/parts/preferences/browser/preferencesActions';
import {
	IPreferencesService, IKeybindingsEditor, CONTEXT_KEYBINDING_FOCUS, CONTEXT_KEYBINDINGS_EDITOR, CONTEXT_KEYBINDINGS_SEARCH_FOCUS, KEYBINDINGS_EDITOR_COMMAND_DEFINE, KEYBINDINGS_EDITOR_COMMAND_REMOVE, KEYBINDINGS_EDITOR_COMMAND_SEARCH,
	KEYBINDINGS_EDITOR_COMMAND_COPY, KEYBINDINGS_EDITOR_COMMAND_RESET, KEYBINDINGS_EDITOR_COMMAND_SHOW_CONFLICTS, KEYBINDINGS_EDITOR_COMMAND_FOCUS_KEYBINDINGS, KEYBINDINGS_EDITOR_COMMAND_CLEAR_SEARCH_RESULTS
} from 'vs/workbench/parts/preferences/common/preferences';
import { PreferencesService } from 'vs/workbench/parts/preferences/browser/preferencesService';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { PreferencesContribution } from 'vs/workbench/parts/preferences/common/preferencesContribution';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { IEditorRegistry, EditorDescriptor, Extensions as EditorExtensions } from 'vs/workbench/browser/editor';

registerSingleton(IPreferencesService, PreferencesService);

Registry.as<IEditorRegistry>(EditorExtensions.Editors).registerEditor(
	new EditorDescriptor(
		PreferencesEditor,
		PreferencesEditor.ID,
		nls.localize('defaultPreferencesEditor', "Default Preferences Editor")
	),
	[
		new SyncDescriptor(PreferencesEditorInput)
	]
);

Registry.as<IEditorRegistry>(EditorExtensions.Editors).registerEditor(
	new EditorDescriptor(
		KeybindingsEditor,
		KeybindingsEditor.ID,
		nls.localize('keybindingsEditor', "Keybindings Editor")
	),
	[
		new SyncDescriptor(KeybindingsEditorInput)
	]
);

interface ISerializedPreferencesEditorInput {
	name: string;
	description: string;

	detailsSerialized: string;
	masterSerialized: string;

	detailsTypeId: string;
	masterTypeId: string;
}

// Register Preferences Editor Input Factory
class PreferencesEditorInputFactory implements IEditorInputFactory {

	public serialize(editorInput: EditorInput): string {
		const input = <PreferencesEditorInput>editorInput;

		if (input.details && input.master) {
			const registry = Registry.as<IEditorInputFactoryRegistry>(EditorInputExtensions.EditorInputFactories);
			const detailsInputFactory = registry.getEditorInputFactory(input.details.getTypeId());
			const masterInputFactory = registry.getEditorInputFactory(input.master.getTypeId());

			if (detailsInputFactory && masterInputFactory) {
				const detailsSerialized = detailsInputFactory.serialize(input.details);
				const masterSerialized = masterInputFactory.serialize(input.master);

				if (detailsSerialized && masterSerialized) {
					return JSON.stringify(<ISerializedPreferencesEditorInput>{
						name: input.getName(),
						description: input.getDescription(),
						detailsSerialized,
						masterSerialized,
						detailsTypeId: input.details.getTypeId(),
						masterTypeId: input.master.getTypeId()
					});
				}
			}
		}

		return null;
	}

	public deserialize(instantiationService: IInstantiationService, serializedEditorInput: string): EditorInput {
		const deserialized: ISerializedPreferencesEditorInput = JSON.parse(serializedEditorInput);

		const registry = Registry.as<IEditorInputFactoryRegistry>(EditorInputExtensions.EditorInputFactories);
		const detailsInputFactory = registry.getEditorInputFactory(deserialized.detailsTypeId);
		const masterInputFactory = registry.getEditorInputFactory(deserialized.masterTypeId);

		if (detailsInputFactory && masterInputFactory) {
			const detailsInput = detailsInputFactory.deserialize(instantiationService, deserialized.detailsSerialized);
			const masterInput = masterInputFactory.deserialize(instantiationService, deserialized.masterSerialized);

			if (detailsInput && masterInput) {
				return new PreferencesEditorInput(deserialized.name, deserialized.description, detailsInput, masterInput);
			}
		}

		return null;
	}
}

class KeybindingsEditorInputFactory implements IEditorInputFactory {

	public serialize(editorInput: EditorInput): string {
		const input = <KeybindingsEditorInput>editorInput;
		return JSON.stringify({
			name: input.getName(),
			typeId: input.getTypeId()
		});
	}

	public deserialize(instantiationService: IInstantiationService, serializedEditorInput: string): EditorInput {
		return instantiationService.createInstance(KeybindingsEditorInput);
	}
}


interface ISerializedDefaultPreferencesEditorInput {
	resource: string;
}

// Register Default Preferences Editor Input Factory
class DefaultPreferencesEditorInputFactory implements IEditorInputFactory {

	public serialize(editorInput: EditorInput): string {
		const input = <DefaultPreferencesEditorInput>editorInput;

		const serialized: ISerializedDefaultPreferencesEditorInput = { resource: input.getResource().toString() };

		return JSON.stringify(serialized);
	}

	public deserialize(instantiationService: IInstantiationService, serializedEditorInput: string): EditorInput {
		const deserialized: ISerializedDefaultPreferencesEditorInput = JSON.parse(serializedEditorInput);

		return instantiationService.createInstance(DefaultPreferencesEditorInput, URI.parse(deserialized.resource));
	}
}

Registry.as<IEditorInputFactoryRegistry>(EditorInputExtensions.EditorInputFactories).registerEditorInputFactory(PreferencesEditorInput.ID, PreferencesEditorInputFactory);
Registry.as<IEditorInputFactoryRegistry>(EditorInputExtensions.EditorInputFactories).registerEditorInputFactory(DefaultPreferencesEditorInput.ID, DefaultPreferencesEditorInputFactory);
Registry.as<IEditorInputFactoryRegistry>(EditorInputExtensions.EditorInputFactories).registerEditorInputFactory(KeybindingsEditorInput.ID, KeybindingsEditorInputFactory);

// Contribute Global Actions
const category = nls.localize('preferences', "Preferences");
const registry = Registry.as<IWorkbenchActionRegistry>(Extensions.WorkbenchActions);
registry.registerWorkbenchAction(new SyncActionDescriptor(OpenGlobalSettingsAction, OpenGlobalSettingsAction.ID, OpenGlobalSettingsAction.LABEL, { primary: KeyMod.CtrlCmd | KeyCode.US_COMMA }), 'Preferences: Open User Settings', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(OpenWorkspaceSettingsAction, OpenWorkspaceSettingsAction.ID, OpenWorkspaceSettingsAction.LABEL), 'Preferences: Open Workspace Settings', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(OpenFolderSettingsAction, OpenFolderSettingsAction.ID, OpenFolderSettingsAction.LABEL), 'Preferences: Open Folder Settings', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(OpenGlobalKeybindingsAction, OpenGlobalKeybindingsAction.ID, OpenGlobalKeybindingsAction.LABEL, { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_S) }), 'Preferences: Open Keyboard Shortcuts', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(OpenGlobalKeybindingsFileAction, OpenGlobalKeybindingsFileAction.ID, OpenGlobalKeybindingsFileAction.LABEL, { primary: null }), 'Preferences: Open Keyboard Shortcuts File', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(ConfigureLanguageBasedSettingsAction, ConfigureLanguageBasedSettingsAction.ID, ConfigureLanguageBasedSettingsAction.LABEL), 'Preferences: Configure Language Specific Settings...', category);

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: KEYBINDINGS_EDITOR_COMMAND_DEFINE,
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR, CONTEXT_KEYBINDING_FOCUS),
	primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_K),
	handler: (accessor, args: any) => {
		const editor = accessor.get(IWorkbenchEditorService).getActiveEditor() as IKeybindingsEditor;
		editor.defineKeybinding(editor.activeKeybindingEntry);
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: KEYBINDINGS_EDITOR_COMMAND_REMOVE,
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR, CONTEXT_KEYBINDING_FOCUS),
	primary: KeyCode.Delete,
	mac: {
		primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.Backspace)
	},
	handler: (accessor, args: any) => {
		const editor = accessor.get(IWorkbenchEditorService).getActiveEditor() as IKeybindingsEditor;
		editor.removeKeybinding(editor.activeKeybindingEntry);
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: KEYBINDINGS_EDITOR_COMMAND_RESET,
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR, CONTEXT_KEYBINDING_FOCUS),
	primary: null,
	handler: (accessor, args: any) => {
		const editor = accessor.get(IWorkbenchEditorService).getActiveEditor() as IKeybindingsEditor;
		editor.resetKeybinding(editor.activeKeybindingEntry);
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: KEYBINDINGS_EDITOR_COMMAND_SEARCH,
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR, CONTEXT_KEYBINDING_FOCUS),
	primary: KeyMod.CtrlCmd | KeyCode.KEY_F,
	handler: (accessor, args: any) => (accessor.get(IWorkbenchEditorService).getActiveEditor() as IKeybindingsEditor).search('')
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: KEYBINDINGS_EDITOR_COMMAND_SHOW_CONFLICTS,
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR, CONTEXT_KEYBINDING_FOCUS),
	primary: null,
	handler: (accessor, args: any) => {
		const editor = accessor.get(IWorkbenchEditorService).getActiveEditor() as IKeybindingsEditor;
		editor.showConflicts(editor.activeKeybindingEntry);
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: KEYBINDINGS_EDITOR_COMMAND_COPY,
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR, CONTEXT_KEYBINDING_FOCUS),
	primary: KeyMod.CtrlCmd | KeyCode.KEY_C,
	handler: (accessor, args: any) => {
		const editor = accessor.get(IWorkbenchEditorService).getActiveEditor() as IKeybindingsEditor;
		editor.copyKeybinding(editor.activeKeybindingEntry);
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: KEYBINDINGS_EDITOR_COMMAND_FOCUS_KEYBINDINGS,
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR, CONTEXT_KEYBINDINGS_SEARCH_FOCUS),
	primary: KeyCode.DownArrow,
	handler: (accessor, args: any) => {
		const editor = accessor.get(IWorkbenchEditorService).getActiveEditor() as IKeybindingsEditor;
		editor.focusKeybindings();
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: KEYBINDINGS_EDITOR_COMMAND_CLEAR_SEARCH_RESULTS,
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR, CONTEXT_KEYBINDINGS_SEARCH_FOCUS),
	primary: KeyCode.Escape,
	handler: (accessor, args: any) => {
		const editor = accessor.get(IWorkbenchEditorService).getActiveEditor() as IKeybindingsEditor;
		editor.clearSearchResults();
	}
});

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(PreferencesContribution);

CommandsRegistry.registerCommand(OPEN_FOLDER_SETTINGS_COMMAND, function (accessor: ServicesAccessor, args?: IWorkspaceFolder) {
	const preferencesService = accessor.get(IPreferencesService);
	return preferencesService.openFolderSettings(args.uri);
});