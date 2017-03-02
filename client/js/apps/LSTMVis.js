/**
 * Created by Hendrik Strobelt (hendrik.strobelt.com) on 1/25/17.
 */
class LSTMVis {

    constructor() {
        this.selectionSVG = d3.select('#selectionVis');
        this.selectedCellsSVG = d3.select('#selectedCellsVis');
        this.matchingSVG = d3.select('#matchingVis');
        this.thresholdForm = d3.select('#thresholdValue');

        this.selectionEventHandler = new SimpleEventHandler(this.selectionSVG.node());
        this.matchingEventHandler = new SimpleEventHandler(this.matchingSVG.node());
        this.controller = new LSTMController({eventHandler: this.selectionEventHandler});
        this.hmHandler = new LSTMHeatmapHandler({
            parentNode: this.matchingSVG,
            controller: this.controller,
            eventHandler: this.matchingEventHandler,
            generalEventHandler: this.selectionEventHandler,
            metaOptionPanel: d3.select('#metaOptions'),
            colorManager: this.controller.colorManager
        })
        this.metaHandler = new LSTMMetaTrackHandler({
            parentNode: d3.select('#metaTracks'),
            controller: this.controller,
            eventHandler: this.selectionEventHandler,
            colorManager: this.controller.colorManager
        })

        // Throttling to stay responsive
        this.updateCellSelection = _.throttle(this._updateCellSelection, 200);

        this.setupSelection();
        this.setupMatching();

        this.bindDataEvents();
        this.bindUIEvents();
        this.bindHoverEvents();

        this.controller.initByUrlAndRun();
    }

    setupSelection() {

        this.selectionSVG.attr('width', this.controller.windowSize.width);

        this.lineplot = new LinePlot({
            parent: this.selectionSVG, eventHandler: this.selectionEventHandler,
            options: {
                cellWidth: this.controller.cellWidth,
                height: 200,
                pos: {x: 0, y: 5},
                globalExclusiveEvents: [LinePlot.events.cellHovered]
            }
        });

        this.wordSequence = new WordSequence({
            parent: this.selectionSVG, eventHandler: this.selectionEventHandler,
            options: {
                cellWidth: this.controller.cellWidth,
                pos: {x: 60 - this.controller.cellWidth, y: 210 + 5}
            }
        });

        this.cellList = new CellList({
            parent: this.selectedCellsSVG, eventHandler: this.selectionEventHandler,
            options: {
                pos: {x: 0, y: 0},
                globalExclusiveEvents: [CellList.events.cellHovered]
            }
        })

        this.thresholdForm.property('value', this.controller.threshold);

    }

    setupMatching() {
        this.matchingSVG
          .attr('width', this.controller.windowSize.width)
          .attr('opacity', 0);

        this.wordMatrix = new WordMatrix({
            parent: this.matchingSVG, eventHandler: this.matchingEventHandler,
            options: {
                cellWidth: this.controller.cellWidth,
                pos: {x: 10, y: 20}
            }
        });

        this.hmHandler.init();
    }

    bindDataEvents() {
        this.selectionEventHandler.bind(LSTMController.events.newContextAvailable,
          () => {
              const states = this.controller.states;
              const timeSteps = states.right - states.left;

              const cellValues = states.data.map(
                (values, index) => ({values, index})
              );

              this.lineplot.update({timeSteps, cellValues});
              this.lineplot.actionUpdateThreshold(this.controller.threshold);


              this.wordSequence.update({
                  words: this.controller.words.words,
                  wordBrush: this.controller.wordBrush,
                  wordBrushZero: this.controller.wordBrushZero
              });

              this.updateCellSelection();
              this.hmHandler.updateMetaOptions();


              const pi = this.controller.projectInfo
              d3.select('#info_position').text(this.controller.pos)
              d3.select('#info_projectName').text(pi.name);
              d3.select('#info_id').text(this.controller.projectID);
              d3.select('#info_source').text(this.controller.source);

          });


        this.selectionEventHandler.bind(LSTMController.events.newMatchingResults, () => {
            const wordMatrix = this.controller.matchingWordMatrix;
            wordMatrix.forEach(row => {
                row.posOffset = row.left;
                row.rowId = row.pos;
            });
            this.hmHandler.updateHeatmapData();

            this.wordMatrix.update({wordMatrix});

            this.matchingSVG.transition().attr('opacity', 1);
        })

    }

    _updateCellSelection(recalc = false) {
        const cellSelection = this.controller.cellSelection(recalc);
        this.lineplot.actionUpdateSelectedCells(cellSelection);

        if (cellSelection.length == 0) {
            this.wordSequence.actionChangeWordBackgrounds(null)
            this.cellList.update({cells: []})
        } else {
            const sumVec = this.controller.sumCellValues(cellSelection);
            const cScale = d3.scaleLinear().domain([0, d3.max(sumVec)]).range(['white', '#1399e4']);

            this.wordSequence.actionChangeWordBackgrounds(sumVec.map(v => cScale(v)))
            this.cellList.update({cells: cellSelection})
        }


    }

    bindUIEvents() {
        const cellWidthUpdate = () => {
            const cellWidth = this.controller.cellWidth;
            this.lineplot.updateOptions({
                options: {cellWidth},
                reRender: true
            });

            this.wordSequence.updateOptions({
                options: {cellWidth, pos: {x: 60 - cellWidth, y: 215}},
                reRender: true
            });

            this.wordMatrix.updateOptions({
                options: {cellWidth},
                reRender: true
            });

            this.metaHandler.actionCellWidthChange();

        };


        d3.select('#smaller_btn').on('click', () => {
            this.controller.cellWidth = Math.max(5, this.controller.cellWidth - 5);
            cellWidthUpdate()
        });
        d3.select('#larger_btn').on('click', () => {
            this.controller.cellWidth = this.controller.cellWidth + 5;
            cellWidthUpdate()
        });

        d3.select('#match_precise').on('click',
          () => {
              this.matchingSVG.transition().attr('opacity', 0);

              this.controller.requestMatch({
                  metaDims: [...Object.keys(this.controller.projectInfo.meta)],
                  mode: 'precise'
              })
          });

        d3.select('#match_fast').on('click',
          () => {
              this.matchingSVG.transition().attr('opacity', 0);
              this.controller.requestMatch({
                  metaDims: [...Object.keys(this.controller.projectInfo.meta)],
                  mode: 'fast'
              })
          });


        this.selectionEventHandler.bind(LinePlot.events.moreContext,
          () => this.controller.requestContext({}));


        // --------------------------------
        // -- Move Position ---
        // --------------------------------


        const modifyPos = offset => {
            const oldBrush = this.controller.wordBrush;
            if (oldBrush) {
                this.controller.wordBrush = [oldBrush[0] - offset, oldBrush[1] - offset]
            }
            this.controller.pos = this.controller.pos + offset;
            this.controller.requestContext({});
        }

        d3.select('#inc_pos').on('click', () => {
            modifyPos(+5);
        });
        d3.select('#dec_pos').on('click', () => {
            modifyPos(-5);
        });


        // --------------------------------
        // -- Brush Events and Handling ---
        // --------------------------------


        this.selectionEventHandler.bind(WordSequence.events.brushSelectionChanged,
          sel => {
              this.controller.wordBrush = sel;
              this.updateCellSelection(true);
          }
        );

        this.selectionEventHandler.bind(WordSequence.events.zeroBrushSelectionChanged,
          sel => {
              this.controller.wordBrushZero = sel;
              this.updateCellSelection(true);
          }
        );

        this.selectionEventHandler.bind(LinePlot.events.thresholdChanged, th => {
              this.controller.threshold = th.newValue;
              this.thresholdForm.property('value', th.newValue);
              this.updateCellSelection(true);
          }
        )

        this.thresholdForm.on('change', () => {
            const newValue = this.thresholdForm.property('value');
            this.selectionEventHandler.trigger(LinePlot.events.thresholdChanged, {newValue});
        })

        this.selectionEventHandler.bind(LSTMController.events.windowResize, () => {
            const newWidth = this.controller.windowSize.width;
            this.selectionSVG.attr('width', newWidth);
            this.matchingSVG.attr('width', newWidth);
        })


    }

    bindHoverEvents() {
        this.selectionEventHandler.bind(
          [CellList.events.cellHovered, LinePlot.events.cellHovered].join(' '),
          d => {
              this.lineplot.actionCellHovered(d.index);
              this.cellList.actionCellHovered(d.index);
          })

        this.matchingEventHandler.bind(
          [WordMatrix.events.cellHovered, HeatMap.events.cellHovered].join(' '),
          d => {
              this.wordMatrix.actionCellHovered(d.row, d.col, d.active);
              this.hmHandler.actionCellHovered(d.row, d.col, d.active);
          })

        this.matchingEventHandler.bind(
          HeatMap.events.rectSelected,
          hm_id => {
              const heatmap = this.hmHandler.getHeatmapById(hm_id);
              if (heatmap) {
                  const colorScale = heatmap.renderData.colorScale;
                  const colorMap = heatmap.data.values
                    .map(row => row.map(cell => colorScale(cell)));
                  this.wordMatrix.actionChangeHeatmap(colorMap)
              } else {
                  this.wordMatrix.actionChangeHeatmap(null);
              }

          }
        )

    }

}

const lstmVis = new LSTMVis();

lstmVis;
