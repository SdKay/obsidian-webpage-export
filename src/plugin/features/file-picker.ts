import { TFile } from "obsidian";
import { FileTree, FileTreeItem } from "src/plugin/features/file-tree";
import { Path } from "src/plugin/utils/path";
import { Website } from "src/plugin/website/website";
import { _MarkdownRendererInternal, MarkdownRendererAPI } from "src/plugin/render-api/render-api";
import { i18n } from "../translations/language";

export class FilePickerTree extends FileTree
{
	public children: FilePickerTreeItem[] = [];
	public selectAllItem: FilePickerTreeItem | undefined;

	public constructor(files: Path[], keepOriginalExtensions: boolean = false, sort = true)
	{
		super(files, keepOriginalExtensions, sort);
		this.renderMarkdownTitles = false;
		this.addCollapseAllButton = false;
	}

	protected override async populateTree(): Promise<void> 
	{
		this.regexBlacklist = this.regexBlacklist.filter((pattern) => pattern.trim() != "");
		let filteredFiles = this.files.filter((file) => this.regexBlacklist.every((pattern) => !file.path.match(new RegExp(pattern))));
		filteredFiles = filteredFiles.filter((file) => this.regexWhitelist.every((pattern) => file.path.match(new RegExp(pattern))));
		for (const file of filteredFiles)
		{
			const pathSections: Path[] = [];

			let parentFile: Path = file.copy;
			while (parentFile != undefined)
			{
				pathSections.push(parentFile);
				// @ts-ignore
				parentFile = parentFile.parent;
			}

			pathSections.reverse();

			let parent: FilePickerTreeItem | FilePickerTree = this;
			for (let i = 0; i < pathSections.length; i++)
			{
				const section = pathSections[i];
				const depth = i+1;
				const isFolder = section.isDirectory;

				// make sure this section hasn't already been added
				let child = parent.children.find(sibling => sibling.title == section.fullName && sibling.isFolder == isFolder && sibling.depth == depth) as FilePickerTreeItem | undefined;
				
				if (child == undefined)
				{
					child = new FilePickerTreeItem(this, parent, depth);
					child.title = section.fullName;
					child.isFolder = isFolder;

					if(child.isFolder) 
					{
						child.dataRef = section.path;
					}
					else 
					{
						const tfile = app.vault.getFileByPath(section.path);
						if (tfile) child.file = tfile;
					}

					parent.children.push(child);
				}
				parent = child;
			}
			
			if (parent instanceof FilePickerTreeItem)
			{
				const path = file.copy;
				const tfile = app.vault.getAbstractFileByPath(path.path);

				if (file.isDirectory) path.folderize();
				else 
				{
					parent.originalExtension = path.extensionName;
					if(!this.keepOriginalExtensions && MarkdownRendererAPI.isConvertable(path.extensionName)) path.setExtension("html");
				}

				parent.dataRef = path.path;
				if (tfile)
				{
					parent.title = (await _MarkdownRendererInternal.getTitleForFile(tfile)).title;
				}
			}
		}

		if (this.sort) 
		{
			this.sortAlphabetically();
			this.sortByIsFolder();
		}
	}

	protected async generateTree(container: HTMLElement): Promise<void> 
	{
		await super.generateTree(container);

		// add a select all button at the top
		const selectAllButton = new FilePickerTreeItem(this, this, 0);
		selectAllButton.title = i18n.exportModal.filePicker.selectAll;
		let selectAllEl = await selectAllButton.insert(container);

		// remove all event listeners from the select all button
		const oldItemEl = selectAllEl;
		selectAllEl = selectAllEl.cloneNode(true) as HTMLDivElement;
		selectAllButton.checkbox = selectAllEl.querySelector("input") as HTMLInputElement;
		selectAllButton.itemEl = selectAllEl;
		selectAllButton.childContainer = selectAllEl.querySelector(".tree-item-children") as HTMLDivElement;
		selectAllEl.classList.add("select-all");
		
		const treeHeader = container.querySelector(".feature-header");
		treeHeader?.append(selectAllEl);
		oldItemEl.remove();

		const localThis = this;
		function selectAll()
		{
			const checked = selectAllButton.checkbox.checked;
			selectAllButton.check(!checked);
			localThis.forAllChildren((child) => child.check(!checked));
		}

		selectAllButton.checkbox.addEventListener("click", (event) =>
		{
			selectAllButton.checkbox.checked = !selectAllButton.checkbox.checked;
			selectAll();
			event.stopPropagation();
		});

		selectAllButton.itemEl.addEventListener("click", () =>
		{
			selectAll();
		});

		this.selectAllItem = selectAllButton;
	}
	
	public getSelectedFiles(): TFile[]
	{
		const selectedFiles: TFile[] = [];
		
		this.forAllChildren((child) =>
		{
			if(child.checked && !child.isFolder) selectedFiles.push(child.file);
		});

		return selectedFiles;
	}

	public getSelectedFilesSavePaths(): string[]
	{
		let selectedFiles: string[] = [];

		if (this.selectAllItem?.checked) 
		{
			selectedFiles = ["all"];
			return selectedFiles;
		}
		
		this.forAllChildren((child) =>
		{
			selectedFiles.push(...child.getSelectedFilesSavePaths());
		}, false);


		return selectedFiles;
	}

	public setSelectedFiles(files: string[])
	{
		if (files.includes("all"))
		{
			this.selectAllItem?.check(true, false, true);
			this.forAllChildren((child) => child.check(true));
			return;
		}

		this.forAllChildren((child) =>
		{
			if(files.includes(child.dataRef ?? ""))
			{
				child.check(true);
			}
		});

		this.evaluateFolderChecks();
	}

	public forAllChildren(func: (child: FilePickerTreeItem) => void, recursive?: boolean): void {
		super.forAllChildren(func, recursive);
	}

	public evaluateFolderChecks()
	{
		// tri-state a folder's checkbox based on its descendant files:
		// none checked -> unchecked, all checked -> checked, some checked -> indeterminate
		this.forAllChildren((child) =>
		{
			if(child.isFolder)
			{
				const totalChildren = child?.itemEl?.querySelectorAll(".nav-file .file-checkbox").length ?? 0;
				const checkedChildren = child?.itemEl?.querySelectorAll(".nav-file .file-checkbox.checked").length ?? 0;

				if (totalChildren > 0 && checkedChildren == totalChildren)
				{
					child.check(true, false, true);
				}
				else if (checkedChildren == 0)
				{
					child.check(false, false, true);
				}
				else
				{
					child.setIndeterminate();
				}
			}
		});

		// tri-state the select all button the same way, based on the top-level items
		const checkedCount = this.children.filter(child => child.checked).length;
		const indeterminateCount = this.children.filter(child => child.checkbox.indeterminate).length;

		if (this.children.length > 0 && checkedCount == this.children.length)
		{
			this.selectAllItem?.check(true, false, true);
		}
		else if (checkedCount == 0 && indeterminateCount == 0)
		{
			this.selectAllItem?.check(false, false, true);
		}
		else
		{
			this.selectAllItem?.setIndeterminate();
		}
	}
}

export class FilePickerTreeItem extends FileTreeItem
{
	public file: TFile;
	public checkbox: HTMLInputElement;
	public tree: FilePickerTree;
	public checked: boolean = false;

	protected override async insertSelf(container: HTMLElement): Promise<HTMLElement>
	{
		const self = await super.insertSelf(container);

		this.checkbox = self.createEl("input");
		self.prepend(this.checkbox);
		this.checkbox.classList.add("file-checkbox");
		this.checkbox.setAttribute("type", "checkbox");
		this.checkbox.addEventListener("click", (event) =>
		{
			event.stopPropagation();

			this.check(this.checkbox.checked, false);
			this.tree.evaluateFolderChecks();
		});

		const localThis = this;
		self?.addEventListener("click", function(event)
		{
			if(localThis.isFolder) localThis.toggleCollapse();
			else localThis.toggle(true);
		});
		
		return self;
	}

	public check(checked: boolean, evaluate: boolean = false, skipChildren: boolean = false)
	{
		this.checked = checked;
		this.checkbox.checked = checked;
		this.checkbox.indeterminate = false;
		this.checkbox.removeAttribute("data-indeterminate");
		this.checkbox.classList.toggle("checked", checked);
		if (!skipChildren) this.checkAllChildren(checked);
		if(evaluate) this.tree.evaluateFolderChecks();
	}

	// some but not all descendants are checked. Obsidian's checkbox CSS keys off the
	// `data-indeterminate="true"` attribute (`input[type=checkbox][data-indeterminate="true"]:not(:checked):after`
	// in app.css), not the native `:indeterminate` pseudo-class, so both must be set.
	public setIndeterminate()
	{
		this.checked = false;
		this.checkbox.checked = false;
		this.checkbox.indeterminate = true;
		this.checkbox.setAttribute("data-indeterminate", "true");
		this.checkbox.classList.toggle("checked", false);
	}

	public toggle(evaluate = false)
	{
		this.check(!this.checked, evaluate);
	}

	public checkAllChildren(checked: boolean)
	{
		this.forAllChildren((child) => child.check(checked));
	}

	public forAllChildren(func: (child: FilePickerTreeItem) => void, recursive?: boolean): void 
	{
		super.forAllChildren(func, recursive);
	}

	public getSelectedFilesSavePaths(): string[]
	{
		const selectedFiles: string[] = [];

		if (this.checked) 
		{
			selectedFiles.push(this.dataRef ?? "");
		}
		else if (this.isFolder)
		{
			this.forAllChildren((child) =>
			{
				selectedFiles.push(...child.getSelectedFilesSavePaths());
			}, false);
		}
		
		return selectedFiles;
	}

}
