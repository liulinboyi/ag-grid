import { ApplyColumnStateParams, GridOptions } from 'ag-grid-community';
import { getCell } from '../agQuery';
import { AG_CELL_RANGE_SINGLE_CELL_CLASSNAME, AG_DND_GHOST_SELECTOR } from '../constants';
import { MouseCapture } from '../createMouseCapture';
import { EasingFunction } from '../tween';
import { clearAllSingleCellSelections } from './clearAllSingleCellSelections';
import { dragColumnToRowGroupPanel } from './dragColumnToRowGroupPanel';

interface ResetAction {
    actionType: 'reset';
}

interface ResetColumnStateAction {
    actionType: 'resetColumnState';
}

interface DragColumnToRowGroupPanelAction {
    actionType: 'dragColumnToRowGroupPanel';
    actionParams: {
        mouse: HTMLElement;
        headerCellName: string;
        duration: number;
        easing?: EasingFunction;
        mouseCapture: MouseCapture;
    };
}

interface ToggleGroupCellAction {
    actionType: 'toggleGroupCell';
    actionParams: {
        key: string;
        expand: boolean;
        skipParents?: boolean;
    };
}

/**
 * Focus on the cell element
 *
 * Warning: This will make the viewport jump if you scroll away from the grid
 */
export interface FocusCellAction {
    actionType: 'focusCell';
    actionParams: {
        colIndex: number;
        rowIndex: number;
    };
}

/**
 * Add visual styles for selecting a single cell
 *
 * NOTE: Not a browser based focus
 */
export interface SelectSingleCellAction {
    actionType: 'selectSingleCell';
    actionParams: {
        colIndex: number;
        rowIndex: number;
    };
}

export interface ClearSelectSingleCellAction {
    actionType: 'clearSelectSingleCell';
    actionParams: {
        colIndex: number;
        rowIndex: number;
    };
}

export interface ClearAllSingleCellSelectionsAction {
    actionType: 'clearAllSingleCellSelections';
}

interface CloseToolPanelAction {
    actionType: 'closeToolPanel';
}

interface OpenToolPanelAction {
    actionType: 'openToolPanel';
    actionParams: {
        toolPanelKey: string;
    };
}

interface ApplyColumnStateAction {
    actionType: 'applyColumnState';
    actionParams: ApplyColumnStateParams;
}

export type AGCreatorAction =
    | ResetAction
    | ResetColumnStateAction
    | DragColumnToRowGroupPanelAction
    | ToggleGroupCellAction
    | SelectSingleCellAction
    | ClearSelectSingleCellAction
    | ClearAllSingleCellSelectionsAction
    | FocusCellAction
    | OpenToolPanelAction
    | CloseToolPanelAction
    | ApplyColumnStateAction;

export function createAGActionCreator({
    containerEl,
    gridOptions,
}: {
    containerEl?: HTMLElement;
    gridOptions: GridOptions;
}) {
    return (agAction: AGCreatorAction) => {
        const { actionType } = agAction;

        if (actionType === 'reset') {
            gridOptions?.columnApi?.resetColumnState();
            gridOptions?.columnApi?.resetColumnGroupState();
            gridOptions?.columnApi?.setColumnsPinned([], null);
            gridOptions?.api?.closeToolPanel();
            document.querySelector(AG_DND_GHOST_SELECTOR)?.remove();
            clearAllSingleCellSelections();
        } else if (actionType === 'resetColumnState') {
            gridOptions?.columnApi?.resetColumnState();
        } else if (actionType === 'dragColumnToRowGroupPanel') {
            const action = agAction as DragColumnToRowGroupPanelAction;

            // NOTE: Need to return promise, so that it gets resolved downstream
            return dragColumnToRowGroupPanel({ containerEl, ...action.actionParams });
        } else if (actionType === 'toggleGroupCell') {
            const action = agAction as ToggleGroupCellAction;
            const expandParents = !action.actionParams.skipParents;

            gridOptions?.api?.forEachNode((node) => {
                if (node.key === action.actionParams.key) {
                    gridOptions?.api?.setRowNodeExpanded(node, action.actionParams.expand, expandParents);
                }
            });
        } else if (actionType === 'focusCell') {
            const action = agAction as FocusCellAction;
            const firstCol = gridOptions?.columnApi?.getAllDisplayedColumns()[action.actionParams.colIndex];
            if (!firstCol) {
                return;
            }
            gridOptions?.api?.ensureColumnVisible(firstCol);
            gridOptions?.api?.setFocusedCell(action.actionParams.rowIndex, firstCol);
        } else if (actionType === 'selectSingleCell') {
            const action = agAction as SelectSingleCellAction;
            const cell = getCell({
                containerEl,
                colIndex: action.actionParams.colIndex,
                rowIndex: action.actionParams.rowIndex,
            });
            cell?.classList.add(AG_CELL_RANGE_SINGLE_CELL_CLASSNAME);
        } else if (actionType === 'clearSelectSingleCell') {
            const action = agAction as ClearSelectSingleCellAction;
            const cell = getCell({
                containerEl,
                colIndex: action.actionParams.colIndex,
                rowIndex: action.actionParams.rowIndex,
            });
            cell?.classList.remove(AG_CELL_RANGE_SINGLE_CELL_CLASSNAME);
        } else if (actionType === 'clearAllSingleCellSelections') {
            clearAllSingleCellSelections();
        } else if (actionType === 'openToolPanel') {
            const action = agAction as OpenToolPanelAction;
            gridOptions?.api?.openToolPanel(action.actionParams.toolPanelKey);
        } else if (actionType === 'closeToolPanel') {
            gridOptions?.api?.closeToolPanel();
        } else if (actionType === 'applyColumnState') {
            const action = agAction as ApplyColumnStateAction;
            gridOptions?.columnApi?.applyColumnState(action.actionParams);
        }
    };
}
