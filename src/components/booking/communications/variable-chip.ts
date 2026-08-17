// Tiptap pieces for the template editor: the inline atom "variable" node
// (rendered as a chip whose label comes from the registry — never from the
// document) and the "/" suggestion extension that opens the variable picker.
// Both are driven entirely by the VARIABLES registry: there is no hardcoded
// variable list anywhere in the editor.

import { Extension, mergeAttributes, Node, type Editor } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import { Suggestion } from "@tiptap/suggestion";
import { VARIABLES, type VariableDef } from "@/lib/booking/notify/variables";

export type VariableItem = {
  /** "group.key" — the {{token}} name. */
  name: string;
  label: string;
  group: string;
};

const REGISTRY = VARIABLES as Record<string, Record<string, VariableDef>>;

export function variableLabel(name: string): string {
  const [group, key] = name.split(".");
  return REGISTRY[group]?.[key]?.label ?? name;
}

export function allVariableItems(): VariableItem[] {
  const items: VariableItem[] = [];
  for (const [group, defs] of Object.entries(REGISTRY)) {
    for (const [key, def] of Object.entries(defs)) {
      items.push({ name: `${group}.${key}`, label: def.label, group });
    }
  }
  return items;
}

export function filterVariableItems(query: string): VariableItem[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return allVariableItems();
  return allVariableItems().filter(
    (item) =>
      item.label.toLowerCase().includes(needle) ||
      item.name.toLowerCase().includes(needle) ||
      item.group.toLowerCase().includes(needle),
  );
}

/**
 * Inline atom chip. Serializes to <span data-variable="group.key">Label</span>
 * (which chipHtmlToTokens turns back into {{group.key}} on save) and parses
 * the same span shape produced by tokensToChipHtml on load.
 */
export const VariableChip = Node.create({
  name: "variable",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      name: {
        default: "",
        parseHTML: (element: HTMLElement) => element.getAttribute("data-variable") ?? "",
        renderHTML: (attributes: { name: string }) => ({ "data-variable": attributes.name }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-variable]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const name = String(node.attrs.name);
    return [
      "span",
      mergeAttributes(HTMLAttributes, { "data-variable-group": name.split(".")[0] ?? "" }),
      variableLabel(name),
    ];
  },
});

export type PickerSnapshot = {
  items: VariableItem[];
  command: (item: VariableItem) => void;
  /** Viewport coordinates of the caret; the picker renders position:fixed. */
  position: { left: number; top: number };
};

export type PickerHandlers = {
  onState: (snapshot: PickerSnapshot | null) => void;
  /** Return true to swallow the key (arrows / enter / escape). */
  onKeyDown: (event: KeyboardEvent) => boolean;
};

export type VariableSuggestionStorage = {
  /** Assigned by the editor component (in an effect) after the editor mounts. */
  handlers: PickerHandlers | null;
};

/** Attach (or detach, with null) the React-side picker callbacks. */
export function registerPickerHandlers(editor: Editor, handlers: PickerHandlers | null): void {
  const storage = editor.storage as unknown as Record<string, VariableSuggestionStorage>;
  const suggestion = storage[VariableSuggestion.name];
  if (suggestion) suggestion.handlers = handlers;
}

/**
 * Typing "/" opens the registry-backed picker; selecting inserts a chip.
 * The React side registers its callbacks on this extension's per-editor
 * storage rather than at creation time, so the extension list stays static.
 */
export const VariableSuggestion = Extension.create<object, VariableSuggestionStorage>({
  name: "variableSuggestion",

  addStorage() {
    return { handlers: null };
  },

  addProseMirrorPlugins() {
    const storage = this.storage;
    const toSnapshot = (props: {
      items: VariableItem[];
      command: (item: VariableItem) => void;
      clientRect?: (() => DOMRect | null) | null;
    }): PickerSnapshot | null => {
      const rect = props.clientRect?.();
      if (!rect) return null;
      return {
        items: props.items,
        command: props.command,
        position: { left: rect.left, top: rect.bottom + 4 },
      };
    };
    return [
      Suggestion<VariableItem, VariableItem>({
        editor: this.editor,
        pluginKey: new PluginKey("variableSuggestion"),
        char: "/",
        allowSpaces: false,
        items: ({ query }) => filterVariableItems(query),
        command: ({ editor, range, props }) => {
          editor
            .chain()
            .focus()
            .insertContentAt(range, [
              { type: "variable", attrs: { name: props.name } },
              { type: "text", text: " " },
            ])
            .run();
        },
        render: () => ({
          onStart: (props) => storage.handlers?.onState(toSnapshot(props)),
          onUpdate: (props) => storage.handlers?.onState(toSnapshot(props)),
          onExit: () => storage.handlers?.onState(null),
          onKeyDown: (props) => storage.handlers?.onKeyDown(props.event) ?? false,
        }),
      }),
    ];
  },
});
