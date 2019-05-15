import { Scene } from "../scene/scene";
import { Group } from "../scene/group";
import { Series, SeriesNodeDatum } from "./series/series";
import { Padding } from "../util/padding";
import { Shape } from "../scene/shape/shape";
import { Node } from "../scene/node";
import { Legend, LegendDatum, Orientation } from "./legend";
import { BBox } from "../scene/bbox";
import { find } from "../util/array";
import { makeSeries } from "./series/helpers";

export enum LegendPosition {
    Top,
    Right,
    Bottom,
    Left
}

export interface ChartOptions {
    parent?: HTMLElement,
    width?: number,
    height?: number,
    series?: any[],
    data?: any,
    padding?: Padding,
    legendPosition?: LegendPosition,
    legendPadding?: number,
    tooltipClass?: string
}

export abstract class Chart {
    readonly scene: Scene = new Scene();
    legend = new Legend();

    protected legendAutoPadding = new Padding();

    private tooltipElement: HTMLDivElement = document.createElement('div');
    private tooltipRect?: ClientRect;

    tooltipOffset = [20, 20];

    protected constructor() {
        this.scene.root = new Group();
        this.legend.onLayoutChange = this.onLegendLayoutChange.bind(this);

        this.tooltipElement.style.display = 'none';
        this.tooltipClass = 'ag-chart-tooltip';
        document.body.appendChild(this.tooltipElement);

        this.setupListeners(this.scene.hdpiCanvas.canvas);
    }

    protected init(options: ChartOptions) {
        if (options.parent) {
            this.parent = options.parent;
        }
        if (options.width) {
            this.width = options.width;
        }
        if (options.height) {
            this.height = options.height;
        }
        if (options.series) {
            const seriesConfigs = options.series;
            const seriesInstances = [];
            for (let i = 0, n = seriesConfigs.length; i < n; i++) {
                const seriesInstance = makeSeries(seriesConfigs[i]);
                if (seriesInstance) {
                    seriesInstances.push(seriesInstance);
                }
            }
            this.series = seriesInstances;
        }
        if (options.padding) {
            this.padding = options.padding;
        }
        if (options.legendPosition) {
            this.legendPosition = options.legendPosition;
        }
        if (options.legendPadding) {
            this.legendPadding = options.legendPadding;
        }
        if (options.data) {
            this.data = options.data;
        }
        if (options.tooltipClass) {
            this.tooltipClass = options.tooltipClass;
        }
    }

    destroy() {
        const tooltipParent = this.tooltipElement.parentNode;
        if (tooltipParent) {
            tooltipParent.removeChild(this.tooltipElement);
        }

        this.legend.onLayoutChange = undefined;
        this.cleanupListeners(this.scene.hdpiCanvas.canvas);
        this.scene.parent = null;
    }

    onLegendLayoutChange() {
        this.layoutPending = true;
    }

    get element(): HTMLElement {
        return this.scene.hdpiCanvas.canvas;
    }

    set parent(value: HTMLElement | null) {
        this.scene.parent = value;
    }
    get parent(): HTMLElement | null {
        return this.scene.parent;
    }

    abstract get seriesRoot(): Node;

    protected _series: Series<Chart>[] = [];
    set series(values: Series<Chart>[]) {
        this._series = values;
    }
    get series(): Series<Chart>[] {
        return this._series;
    }

    addSeries(series: Series<Chart>, before: Series<Chart> | null = null): boolean {
        const canAdd = this.series.indexOf(series) < 0;

        if (canAdd) {
            const beforeIndex = before ? this.series.indexOf(before) : -1;

            if (beforeIndex >= 0) {
                this.series.splice(beforeIndex, 0, series);
                this.seriesRoot.insertBefore(series.group, before!.group);
            } else {
                this.series.push(series);
                this.seriesRoot.append(series.group);
            }
            series.chart = this;
            this.dataPending = true;
            return true;
        }

        return false;
    }

    removeSeries(series: Series<Chart>): boolean {
        const index = this.series.indexOf(series);

        if (index >= 0) {
            this.series.splice(index, 1);
            series.chart = null;
            this.seriesRoot.removeChild(series.group);
            this.dataPending = true;
            return true;
        }

        return false;
    }

    removeAllSeries(): void {
        this.series.forEach(series => {
            series.chart = null;
            this.seriesRoot.removeChild(series.group);
        });
        this._series = []; // using `_series` instead of `series` to prevent infinite recursion
        this.dataPending = true;
    }

    private _legendPosition: LegendPosition = LegendPosition.Right;
    set legendPosition(value: LegendPosition) {
        if (this._legendPosition !== value) {
            this._legendPosition = value;
            this.legendAutoPadding.clear();
            switch (value) {
                case LegendPosition.Right:
                case LegendPosition.Left:
                    this.legend.orientation = Orientation.Vertical;
                    break;
                case LegendPosition.Bottom:
                case LegendPosition.Top:
                    this.legend.orientation = Orientation.Horizontal;
                    break;
            }
            this.layoutPending = true;
        }
    }
    get legendPosition(): LegendPosition {
        return this._legendPosition;
    }

    private _legendPadding: number = 20;
    set legendPadding(value: number) {
        if (this._legendPadding !== value) {
            this._legendPadding = value;
            this.layoutPending = true;
        }
    }
    get legendPadding(): number {
        return this._legendPadding;
    }

    private _data: any[] = [];
    set data(data: any[]) {
        this._data = data;
        this.series.forEach(series => series.data = data);
    }
    get data(): any[] {
        return this._data;
    }

    protected _padding = new Padding(20);
    set padding(value: Padding) {
        this._padding = value;
        this.layoutPending = true;
    }
    get padding(): Padding {
        return this._padding;
    }

    set size(value: [number, number]) {
        this.scene.size = value;
        this.layoutPending = true;
    }
    get size(): [number, number] {
        return [this.scene.width, this.scene.height];
    }

    /**
     * The width of the chart in CSS pixels.
     */
    set width(value: number) {
        this.scene.width = value;
        this.layoutPending = true;
    }
    get width(): number {
        return this.scene.width;
    }

    /**
     * The height of the chart in CSS pixels.
     */
    set height(value: number) {
        this.scene.height = value;
        this.layoutPending = true;
    }
    get height(): number {
        return this.scene.height;
    }

    private layoutCallbackId: number = 0;
    set layoutPending(value: boolean) {
        if (value) {
            if (!(this.layoutCallbackId || this.dataPending)) {
                this.layoutCallbackId = requestAnimationFrame(this._performLayout);
            }
        } else if (this.layoutCallbackId) {
            cancelAnimationFrame(this.layoutCallbackId);
            this.layoutCallbackId = 0;
        }
    }
    /**
     * Only `true` while we are waiting for the layout to start.
     * This will be `false` if the layout has already started and is ongoing.
     */
    get layoutPending(): boolean {
        return !!this.layoutCallbackId;
    }

    private readonly _performLayout = () => {
        this.layoutCallbackId = 0;
        this.performLayout();
        if (this.onLayoutDone) {
            this.onLayoutDone();
        }
    };

    private dataCallbackId: number = 0;
    set dataPending(value: boolean) {
        if (value) {
            if (!this.dataCallbackId) {
                this.dataCallbackId = setTimeout(this._processData, 0); // run on next tick
            }
        } else if (this.dataCallbackId) {
            clearTimeout(this.dataCallbackId);
            this.dataCallbackId = 0;
        }
    }
    get dataPending(): boolean {
        return !!this.dataCallbackId;
    }

    onLayoutDone?: () => void;

    private readonly _processData = () => {
        this.dataCallbackId = 0;
        this.processData();
    };

    processData(): void {
        this.layoutPending = false;

        const legendData: LegendDatum[] = [];
        this.series.forEach(series => {
            if (series.visible) {
                series.processData();
            }
            if (series.showInLegend) {
                series.listSeriesItems(legendData);
            }
        });
        this.legend.data = legendData;

        this.layoutPending = true;
    }

    abstract performLayout(): void;

    private legendBBox?: BBox;

    protected positionLegend() {
        if (!this.legend.data.length) {
            return; // TODO: figure out why we ever arrive here (data should be processed before layout)
        }

        const width = this.width;
        const height = this.height;
        const legend = this.legend;
        const legendGroup = legend.group;
        const legendPadding = this.legendPadding;
        const legendAutoPadding = this.legendAutoPadding;

        legend.group.translationX = 0;
        legend.group.translationY = 0;

        let legendBBox: BBox;
        switch (this.legendPosition) {
            case LegendPosition.Bottom:
                legend.performLayout(width - legendPadding * 2, 0);
                legendBBox = legendGroup.getBBox();

                legendGroup.translationX = (width - legendBBox.width) / 2 - legendBBox.x;
                legendGroup.translationY = height - legendBBox.height - legendBBox.y - legendPadding;

                if (legendAutoPadding.bottom !== legendBBox.height) {
                    legendAutoPadding.bottom = legendBBox.height;
                    this.layoutPending = true;
                }
                break;

            case LegendPosition.Top:
                legend.performLayout(width - legendPadding * 2, 0);
                legendBBox = legendGroup.getBBox();

                legendGroup.translationX = (width - legendBBox.width) / 2 - legendBBox.x;
                legendGroup.translationY = legendPadding - legendBBox.y;

                if (legendAutoPadding.top !== legendBBox.height) {
                    legendAutoPadding.top = legendBBox.height;
                    this.layoutPending = true;
                }
                break;

            case LegendPosition.Left:
                legend.performLayout(0, height - legendPadding * 2);
                legendBBox = legendGroup.getBBox();

                legendGroup.translationX = legendPadding - legendBBox.x;
                legendGroup.translationY = (height - legendBBox.height) / 2 - legendBBox.y;

                if (legendAutoPadding.left !== legendBBox.width) {
                    legendAutoPadding.left = legendBBox.width;
                    this.layoutPending = true;
                }
                break;

            default: // case LegendPosition.Right:
                legend.performLayout(0, height - legendPadding * 2);
                legendBBox = legendGroup.getBBox();

                legendGroup.translationX = width - legendBBox.width - legendBBox.x - legendPadding;
                legendGroup.translationY = (height - legendBBox.height) / 2 - legendBBox.y;

                if (legendAutoPadding.right !== legendBBox.width) {
                    legendAutoPadding.right = legendBBox.width;
                    this.layoutPending = true;
                }
                break;
        }

        this.legendBBox = legendBBox;
    }

    private setupListeners(chartElement: HTMLCanvasElement) {
        chartElement.addEventListener('mousemove', this.onMouseMove);
        chartElement.addEventListener('mouseout', this.onMouseOut);
        chartElement.addEventListener('click', this.onClick);
    }

    private cleanupListeners(chartElement: HTMLCanvasElement) {
        chartElement.removeEventListener('mousemove', this.onMouseMove);
        chartElement.removeEventListener('mouseout', this.onMouseMove);
        chartElement.removeEventListener('click', this.onClick);
    }

    private pickSeriesNode(x: number, y: number): {
        series: Series<Chart>,
        node: Node
    } | undefined {
        const allSeries = this.series;

        let node: Node | undefined = undefined;
        for (let i = allSeries.length - 1; i >= 0; i--) {
            const series = allSeries[i];
            node = series.group.pickNode(x, y);
            if (node) {
                return {
                    series,
                    node
                };
            }
        }
    }

    private lastPick?: {
        series: Series<Chart>,
        node: Shape,
        fillStyle: string | null // used to save the original fillStyle of the node,
                                 // to be restored when the highlight fillStyle is removed
    };

    private readonly onMouseMove = (event: MouseEvent) => {
        const x = event.offsetX;
        const y = event.offsetY;

        const pick = this.pickSeriesNode(x, y);
        if (pick) {
            const node = pick.node;
            if (node instanceof Shape) {
                if (!this.lastPick) { // cursor moved from empty space to a node
                    this.onSeriesNodePick(event, pick.series, node);
                } else {
                    if (this.lastPick.node !== node) { // cursor moved from one node to another
                        this.lastPick.node.fillStyle = this.lastPick.fillStyle;
                        this.onSeriesNodePick(event, pick.series, node);
                    } else { // cursor moved within the same node
                        if (pick.series.tooltip) {
                            this.showTooltip(event);
                        }
                    }
                }
            }
        } else if (this.lastPick) { // cursor moved from a node to empty space
            this.lastPick.node.fillStyle = this.lastPick.fillStyle;
            this.hideTooltip();
            this.lastPick = undefined;
        }
    };

    private readonly onMouseOut = (event: MouseEvent) => {
        this.tooltipElement.style.display = 'none';
    };

    private readonly onClick = (event: MouseEvent) => {
        const x = event.offsetX;
        const y = event.offsetY;

        const datum = this.legend.datumForPoint(x, y);
        if (datum) {
            const {id, itemId, enabled} = datum;
            const series = find(this.series, series => series.id === id);

            if (series) {
                series.toggleSeriesItem(itemId, !enabled);
            }
        }
    };

    private onSeriesNodePick(event: MouseEvent, series: Series<Chart>, node: Shape) {
        this.lastPick = {
            series,
            node,
            fillStyle: node.fillStyle
        };
        node.fillStyle = 'yellow';

        const html = series.tooltip && series.getTooltipHtml(node.datum as SeriesNodeDatum);
        if (html) {
            this.showTooltip(event, html);
        }
    }

    private _tooltipClass: string = '';
    set tooltipClass(value: string) {
        if (this._tooltipClass !== value) {
            this._tooltipClass = value;
            this.tooltipElement.setAttribute('class', value);
        }
    }
    get tooltipClass(): string {
        return this._tooltipClass;
    }

    /**
     * Shows tooltip at the given event's coordinates.
     * If the `html` parameter is missing, moves the existing tooltip to the new position.
     */
    private showTooltip(event: MouseEvent, html?: string) {
        const el = this.tooltipElement;
        const offset = this.tooltipOffset;
        const parent = el.parentElement;

        if (html !== undefined) {
            el.innerHTML = html;
        } else if (!el.innerHTML) {
            return;
        }

        el.style.display = 'table';
        const tooltipRect = this.tooltipRect = el.getBoundingClientRect();

        let left = event.x + scrollX + offset[0];
        const top = event.y + scrollY + offset[1];

        if (tooltipRect && parent && parent.parentElement) {
            if (left + tooltipRect.width > parent.parentElement.offsetWidth) {
                left -= tooltipRect.width + offset[0];
            }
        }
        el.style.left = `${left}px`;
        el.style.top = `${top}px`;
    }

    private hideTooltip() {
        const el = this.tooltipElement;

        el.style.display = 'none';
        el.innerHTML = '';
    }
}
