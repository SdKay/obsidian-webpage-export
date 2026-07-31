import { Settings } from "src/plugin/settings/settings";
import { AssetLoader } from "./base-asset.js";
import { AssetType, InlinePolicy, LoadMethod, Mutability } from "./asset-types.js";
import { AssetHandler } from "./asset-handler.js";

export class OtherPluginStyles extends AssetLoader
{
    private lastEnabledPluginStyles: string[] = [];

    constructor()
    {
        super("other-plugins.css", "", null, AssetType.Style, InlinePolicy.AutoHead, true, Mutability.Dynamic, LoadMethod.Async, 9);
    }

	// Plugin CSS uses each plugin's own class-naming conventions, unrelated to Obsidian's
	// core UI. ObsidianStyles' discard lists are full of generic English word fragments
	// (e.g. "tab", "menu", "header") meant to strip Obsidian's own editor/workspace chrome,
	// and substring-matching those against arbitrary plugin selectors causes false-positive
	// drops (e.g. a plugin's ".foo-tabbar" gets removed because it contains "tab"). Only
	// filter out selectors that are unambiguously editor/CodeMirror-only.
	static readonly obsidianStylesFilter = ["cm-", "cm6", "CodeMirror"];
	static readonly stylesKeep = ["@media"];

	public static async getStyleForPlugin(pluginName: string): Promise<string>
	{
		const path = AssetHandler.vaultPluginsPath.joinString(pluginName.replace("\n", ""), "styles.css");
		if (!path.exists) return "";
		
		return await path.readAsString() ?? "";
	}

    
    override async load()
    {
        // The settings UI mutates `includePluginCss` in place (push/remove on the same
        // array) rather than reassigning it, so comparing by reference can report "unchanged"
        // even after the checked list has actually changed. Compare contents instead.
        const currentPluginStyles = Settings.exportOptions.includePluginCss;
        if (this.lastEnabledPluginStyles.length === currentPluginStyles.length &&
            this.lastEnabledPluginStyles.every((id, i) => id === currentPluginStyles[i])) return;

        this.data = "";        
        for (let i = 0; i < Settings.exportOptions.includePluginCss.length; i++)
        {
            if (!Settings.exportOptions.includePluginCss[i] || (Settings.exportOptions.includePluginCss[i] && !(/\S/.test(Settings.exportOptions.includePluginCss[i])))) continue;
			let pluginName = Settings.exportOptions.includePluginCss[i];
			const style = await OtherPluginStyles.getStyleForPlugin(pluginName);
           
            if (style)
            {
                this.data += await AssetHandler.filterStyleRules(style, [], OtherPluginStyles.obsidianStylesFilter, OtherPluginStyles.stylesKeep);
				console.log("Loaded plugin style: " + Settings.exportOptions.includePluginCss[i] + " size: " + style.length);
            }
        }

        this.lastEnabledPluginStyles = [...currentPluginStyles];
        await super.load();
    }
}
