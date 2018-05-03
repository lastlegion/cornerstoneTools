import EVENTS from '../events.js';
import external from '../externalModules.js';
import toolStyle from '../stateManagement/toolStyle.js';
import toolColors from '../stateManagement/toolColors.js';
import drawHandles from '../manipulators/drawHandles.js';
import drawTextBox from '../util/drawTextBox.js';
import handleActivator from '../manipulators/handleActivator.js';
import pointInsideBoundingBox from '../util/pointInsideBoundingBox.js';
import freeHandArea from '../util/freeHandArea.js';
import calculateFreehandStatistics from '../util/calculateFreehandStatistics.js';
import { freeHandIntersect, freeHandIntersectEnd, freeHandIntersectModify } from '../util/freeHandIntersect.js';
import calculateSUV from '../util/calculateSUV.js';
import triggerEvent from '../util/triggerEvent.js';
import isMouseButtonEnabled from '../util/isMouseButtonEnabled.js';
import drawLink from '../util/drawLink.js';
import { addToolState, getToolState } from '../stateManagement/toolState.js';
import { setToolOptions, getToolOptions } from '../toolOptions.js';

const toolType = 'freehand';
let configuration = {
  mouseLocation: {
    handles: {
      start: {
        highlight: true,
        active: true
      }
    }
  },
  freehand: false,
  modifying: false,
  movingTextBox: false,
  currentHandle: 0,
  currentTool: -1
};

function createNewMeasurement () {
  // Create the measurement data for this tool
  const measurementData = {
    visible: true,
    active: true,
    invalidated: true,
    handles: [],
    textBox: {
      active: false,
      hasMoved: false,
      movesIndependently: false,
      drawnIndependently: true,
      allowedOutsideImage: true,
      hasBoundingBox: true
    }
  };

  return measurementData;
}

function pointNearTool (eventData, toolIndex) {
  const isPointNearTool = pointNearHandle(eventData, toolIndex);

  // JPETTS - if returns index 0, set true (fails first condition as 0 is falsy).
  if (isPointNearTool || isPointNearTool === 0) {
    return true;
  }

  return false;
}

function pointNearHandle (eventData, toolIndex) {
  const toolData = getToolState(eventData.element, toolType);

  if (toolData === undefined) {
    return;
  }

  const data = toolData.data[toolIndex];

  if (data.handles === undefined) {
    return;
  }

  if (data.visible === false) {
    return false;
  }

  const mousePoint = eventData.currentPoints.canvas;

  for (let i = 0; i < data.handles.length; i++) {
    const handleCanvas = external.cornerstone.pixelToCanvas(eventData.element, data.handles[i]);

    if (external.cornerstoneMath.point.distance(handleCanvas, mousePoint) < 5) {
      return i;
    }
  }

  // Check to see if mouse in bounding box of textbox
  if (data.textBox) {
    if (pointInsideBoundingBox(data.textBox, mousePoint)) {
      return data.textBox;
    }
  }

  return;
}

function pointNearHandleAllTools (eventData) {
  const toolData = getToolState(eventData.element, toolType);

  if (!toolData) {
    return;
  }

  let handleNearby;

  for (let toolIndex = 0; toolIndex < toolData.data.length; toolIndex++) {
    handleNearby = pointNearHandle(eventData, toolIndex);
    if (handleNearby !== undefined) {
      return {
        handleNearby,
        toolIndex
      };
    }
  }
}

// /////// BEGIN ACTIVE TOOL ///////

// /////// BEGIN ACTIVE TOOL ///////

function mouseDownActivateCallback (e) {
  const eventData = e.detail;

  startDrawing(eventData);
  addPoint(eventData);

  e.preventDefault();
  e.stopPropagation();
}

// --- Drawing loop ---
// On first click, add point
// After first click, on mouse move, record location
// If mouse comes close to previous point, snap to it
// On next click, add another point -- continuously
// On each click, if it intersects with a current point, end drawing loop

function startDrawing (eventData) {
  const element = eventData.element;

  element.addEventListener(EVENTS.MOUSE_MOVE, mouseMoveCallback);
  element.addEventListener(EVENTS.MOUSE_UP, mouseUpCallback);

  const measurementData = createNewMeasurement();

  const config = freehand.getConfiguration();

  config.mouseLocation.handles.start.x = eventData.currentPoints.image.x;
  config.mouseLocation.handles.start.y = eventData.currentPoints.image.y;

  addToolState(eventData.element, toolType, measurementData);

  const toolData = getToolState(eventData.element, toolType);

  config.currentTool = toolData.data.length - 1;
}

function addPoint (eventData) {
  const toolData = getToolState(eventData.element, toolType);

  if (toolData === undefined) {
    return;
  }

  const config = freehand.getConfiguration();

  // Get the toolData from the last-drawn drawing
  const data = toolData.data[config.currentTool];

  const handleData = {
    x: eventData.currentPoints.image.x,
    y: eventData.currentPoints.image.y,
    highlight: true,
    active: true,
    lines: []
  };

  // If this is not the first handle
  if (data.handles.length) {
    if (isValidNode(handleData, data.handles)) {
      // Add the line from the current handle to the new handle
      data.handles[config.currentHandle - 1].lines.push(eventData.currentPoints.image);
    } else {
      return false;
    }
  }

  // Add the new handle
  data.handles.push(handleData);

  // Increment the current handle value
  config.currentHandle += 1;

  // Reset freehand value

  // Force onImageRendered to fire
  external.cornerstone.updateImage(eventData.element);
}

function endDrawing (eventData, handleNearby) {
  const toolData = getToolState(eventData.element, toolType);

  if (!toolData) {
    return;
  }

  const config = freehand.getConfiguration();

  const data = toolData.data[config.currentTool];

  data.active = false;
  data.highlight = false;

  // Connect the end node to the origin node
  if (handleNearby !== undefined) {
    data.handles[config.currentHandle - 1].lines.push(data.handles[0]);
  }

  if (config.modifying) {
    config.modifying = false;
    data.invalidated = true;
  }

  // Reset the current handle
  config.currentHandle = 0;
  config.currentTool = -1;

  external.cornerstone.updateImage(eventData.element);
}

function mouseUpCallback (e) {
  const eventData = e.detail;
  const element = eventData.element;
  const config = freehand.getConfiguration();
  const toolData = getToolState(eventData.element, toolType);

  element.removeEventListener(EVENTS.MOUSE_UP, mouseUpCallback);
  element.removeEventListener(EVENTS.MOUSE_DRAG, mouseDragCallback);
  element.removeEventListener(EVENTS.MOUSE_CLICK, mouseUpCallback);

  element.addEventListener(EVENTS.MOUSE_MOVE, mouseMoveCallback);

  if (toolData === undefined) {
    return;
  }

  // Check if drawing is finished
  if (config.movingTextBox === true) {
    dropTextbox(toolData, eventData);

    return;
  }

  if (config.modifying) {
    dropHandle(toolData, eventData);

    e.preventDefault();
    e.stopPropagation();
  }

  external.cornerstone.updateImage(eventData.element);
}

function dropTextbox (toolData, eventData) {
  const element = eventData.element;
  const config = freehand.getConfiguration();

  config.movingTextBox = false;
  toolData.data[config.currentTool].invalidated = true;
  config.currentHandle = 0;
  config.currentTool = -1;
  element.removeEventListener(EVENTS.MOUSE_DRAG, mouseDragCallback);

  return;
}

function dropHandle (toolData, eventData) {
  const config = freehand.getConfiguration();
  const currentTool = config.currentTool;

  // Don't allow the line being modified to intersect other lines
  if (freeHandIntersectModify(toolData.data[currentTool].handles, config.currentHandle)) {
    const currentHandle = config.currentHandle;
    const currentHandleData = toolData.data[currentTool].handles[currentHandle];
    let previousHandleData;

    if (currentHandle === 0) {
      const lastNodeID = toolData.data[currentTool].handles.length - 1;

      previousHandleData = toolData.data[currentTool].handles[lastNodeID];
    } else {
      previousHandleData = toolData.data[currentTool].handles[currentHandle - 1];
    }

    // Snap back to previous position
    currentHandleData.x = config.dragOrigin.x;
    currentHandleData.y = config.dragOrigin.y;
    previousHandleData.lines[0] = currentHandleData;
  }

  endDrawing(eventData);

  return;
}

// /////// END ACTIVE TOOL ///////

function mouseDownCallback (e) {
  const eventData = e.detail;
  const element = eventData.element;
  const options = getToolOptions(toolType, element);

  if (!isMouseButtonEnabled(eventData.which, options.mouseButtonMask)) {
    e.stopPropagation();
    e.preventDefault();

    return;
  }

  const toolData = getToolState(eventData.element, toolType);
  let handleNearby, toolIndex;
  const config = freehand.getConfiguration();
  const currentTool = config.currentTool;

  if (currentTool < 0) {
    const nearby = pointNearHandleAllTools(eventData);

    if (nearby) {
      handleNearby = nearby.handleNearby;
      toolIndex = nearby.toolIndex;
      // This means the user clicked on the textBox
      if (handleNearby.hasBoundingBox) {
        element.addEventListener(EVENTS.MOUSE_UP, mouseUpCallback);
        element.addEventListener(EVENTS.MOUSE_DRAG, mouseDragCallback);
        config.movingTextBox = true;
        config.currentHandle = handleNearby;
        config.currentTool = toolIndex;

        e.preventDefault();
        e.stopPropagation();

        return;
      }
      // This means the user is trying to modify a point
      if (handleNearby !== undefined) {

        element.removeEventListener(EVENTS.MOUSE_MOVE, mouseMoveCallback);

        config.dragOrigin = {
          x: toolData.data[toolIndex].handles[handleNearby].x,
          y: toolData.data[toolIndex].handles[handleNearby].y
        };

        // Begin drag edit - call mouseUpCallback at end of drag or straight away if just a click.

        element.addEventListener(EVENTS.MOUSE_UP, mouseUpCallback);
        element.addEventListener(EVENTS.MOUSE_CLICK, mouseUpCallback);
        element.addEventListener(EVENTS.MOUSE_DRAG, mouseDragCallback);

        config.modifying = true;
        config.currentHandle = handleNearby;
        config.currentTool = toolIndex;
        e.preventDefault();
        e.stopPropagation();
      }
    }
  } else if (currentTool >= 0 && toolData.data[currentTool].active) {
    handleNearby = pointNearHandle(eventData, currentTool);
    const lastNodeID = toolData.data[currentTool].handles.length - 1;

    // This means the user is trying to add a point
    if (handleNearby === undefined) {
      e.stopPropagation();
      e.preventDefault();
      addPoint(eventData);

      return;

    } else if (toolData.data[currentTool].handles.length >= 3) {
      // Snap if click registered on origin node or on last node placed
      if ((handleNearby === 0 || handleNearby === lastNodeID) && !freeHandIntersectEnd(toolData.data[currentTool].handles)) {
        endDrawing(eventData, handleNearby);
      }

      e.preventDefault();
      e.stopPropagation();
    }

    return;
  }

}

function mouseMoveCallback (e) {
  const eventData = e.detail;
  const toolData = getToolState(eventData.element, toolType);

  if (!toolData) {
    return;
  }

  const config = freehand.getConfiguration();
  const currentTool = config.currentTool;

  // Tool inactive and passively watching for mouse over
  if (currentTool < 0) {
    const imageNeedsUpdate = mouseHover(eventData, toolData);

    if (!imageNeedsUpdate) {
      return;
    }

  } else {
    // Tool active
    const data = toolData.data[currentTool];
    const currentHandle = config.currentHandle;

    // Set the mouseLocation handle
    getMouseLocation(eventData);

    if (config.freehand) { // JPETTS - Note: currently disabled
      data.handles[currentHandle - 1].lines.push(eventData.currentPoints.image);
    } else {
      // No snapping in freehand mode
      const handleNearby = pointNearHandle(eventData, config.currentTool);

      // If there is a handle nearby to snap to
      // (and it's not the actual mouse handle)
      if (handleNearby !== undefined && !handleNearby.hasBoundingBox && handleNearby < (data.handles.length - 1)) {
        config.mouseLocation.handles.start.x = data.handles[handleNearby].x;
        config.mouseLocation.handles.start.y = data.handles[handleNearby].y;
      }
    }
  }

  // Force onImageRendered
  external.cornerstone.updateImage(eventData.element);
}

function mouseDragCallback (e) {
  const eventData = e.detail;
  const toolData = getToolState(eventData.element, toolType);

  if (!toolData) {
    return;
  }

  const config = freehand.getConfiguration();
  const data = toolData.data[config.currentTool];
  const currentHandle = config.currentHandle;

  // Set the mouseLocation handle
  getMouseLocation(eventData);

  // Check if the tool is active
  if (config.currentTool >= 0) {
    dragHandle(currentHandle, data);
  }

  // Update the image
  external.cornerstone.updateImage(eventData.element);
}

function dragHandle (currentHandle, data) {
  const config = freehand.getConfiguration();

  if (config.movingTextBox) {
    dragTextBox(currentHandle);
  }

  if (config.modifying) {
    dragNode(currentHandle, data);
  }
}

function dragTextBox (currentHandle) {
  const config = freehand.getConfiguration();

  currentHandle.hasMoved = true;
  currentHandle.x = config.mouseLocation.handles.start.x;
  currentHandle.y = config.mouseLocation.handles.start.y;
}

function dragNode (currentHandle, data) {
  const config = freehand.getConfiguration();

  data.active = true;
  data.highlight = true;
  data.handles[currentHandle].x = config.mouseLocation.handles.start.x;
  data.handles[currentHandle].y = config.mouseLocation.handles.start.y;
  if (currentHandle) {
    const lastLineIndex = data.handles[currentHandle - 1].lines.length - 1;
    const lastLine = data.handles[currentHandle - 1].lines[lastLineIndex];

    lastLine.x = config.mouseLocation.handles.start.x;
    lastLine.y = config.mouseLocation.handles.start.y;
  }
}

function isValidNode (newHandle, dataHandles) {
  return !freeHandIntersect(newHandle, dataHandles);
}

function mouseHover (eventData, toolData) {
  // Check if user is mousing over a point
  let imageNeedsUpdate = false;

  for (let i = 0; i < toolData.data.length; i++) {
    // Get the cursor position in canvas coordinates
    const coords = eventData.currentPoints.canvas;
    const data = toolData.data[i];

    if (handleActivator(eventData.element, data.handles, coords) === true) {
      imageNeedsUpdate = true;
    }

    if ((pointNearTool(eventData, i) && !data.active) || (!pointNearTool(eventData, i) && data.active)) {
      data.active = !data.active;
      imageNeedsUpdate = true;
    }

    if (data.textBox === true) {
      if (pointInsideBoundingBox(data.textBox, coords)) {
        data.active = !data.active;
        data.highlight = !data.highlight;
        imageNeedsUpdate = true;
      }
    }
  }

  return imageNeedsUpdate;
}

function getMouseLocation (eventData) {
  // Set the mouseLocation handle
  const config = freehand.getConfiguration();
  let x = Math.max(eventData.currentPoints.image.x, 0);
  let y = Math.max(eventData.currentPoints.image.y, 0);

  x = Math.min(x, eventData.image.width);
  config.mouseLocation.handles.start.x = x;

  y = Math.min(y, eventData.image.height);
  config.mouseLocation.handles.start.y = y;
}

function numberWithCommas (x) {
  // http://stackoverflow.com/questions/2901102/how-to-print-a-number-with-commas-as-thousands-separators-in-javascript
  const parts = x.toString().split('.');

  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  return parts.join('.');
}

// /////// BEGIN IMAGE RENDERING ///////
function onImageRendered (e) {
  const eventData = e.detail;

  // If we have no toolData for this element, return immediately as there is nothing to do
  const toolData = getToolState(e.currentTarget, toolType);

  if (toolData === undefined) {
    return;
  }

  const cornerstone = external.cornerstone;
  const image = eventData.image;
  const element = eventData.element;
  const config = freehand.getConfiguration();
  const seriesModule = cornerstone.metaData.get('generalSeriesModule', image.imageId);
  let modality;

  if (seriesModule) {
    modality = seriesModule.modality;
  }

  // We have tool data for this element - iterate over each one and draw it
  const context = eventData.canvasContext.canvas.getContext('2d');

  context.setTransform(1, 0, 0, 1, 0, 0);

  let color;
  const lineWidth = toolStyle.getToolWidth();
  let fillColor = toolColors.getFillColor();

  for (let i = 0; i < toolData.data.length; i++) {
    context.save();

    const data = toolData.data[i];

    if (data.visible === false) {
      continue;
    }

    if (data.active) {
      color = toolColors.getActiveColor();
      fillColor = toolColors.getFillColor();
    } else {
      color = toolColors.getToolColor();
      fillColor = toolColors.getToolColor();
    }

    let handleStart;

    if (data.handles.length) {
      for (let j = 0; j < data.handles.length; j++) {
        // Draw a line between handle j and j+1
        handleStart = data.handles[j];
        const handleStartCanvas = cornerstone.pixelToCanvas(eventData.element, handleStart);

        context.beginPath();
        context.strokeStyle = color;
        context.lineWidth = lineWidth;
        context.moveTo(handleStartCanvas.x, handleStartCanvas.y);

        for (let k = 0; k < data.handles[j].lines.length; k++) {
          const lineCanvas = cornerstone.pixelToCanvas(eventData.element, data.handles[j].lines[k]);

          context.lineTo(lineCanvas.x, lineCanvas.y);
          context.stroke();
        }

        const mouseLocationCanvas = cornerstone.pixelToCanvas(eventData.element, config.mouseLocation.handles.start);

        if (j === (data.handles.length - 1)) {
          if (!data.polyBoundingBox) {
            // If it's still being actively drawn, keep the last line to
            // The mouse location
            context.lineTo(mouseLocationCanvas.x, mouseLocationCanvas.y);
            context.stroke();
          }
        }
      }
    }

    // If the tool is active, draw a handle at the cursor location
    const options = {
      fill: fillColor
    };

    if (data.active && !data.polyBoundingBox) {
      drawHandles(context, eventData, config.mouseLocation.handles, color, options);
    }
    // Draw the handles
    drawHandles(context, eventData, data.handles, color, options);

    // Define variables for the area and mean/standard deviation
    let area,
      meanStdDev,
      meanStdDevSUV;

    // Perform a check to see if the tool has been invalidated. This is to prevent
    // Unnecessary re-calculation of the area, mean, and standard deviation if the
    // Image is re-rendered but the tool has not moved (e.g. during a zoom)
    if (data.invalidated === false) {
      // If the data is not invalidated, retrieve it from the toolData
      meanStdDev = data.meanStdDev;
      meanStdDevSUV = data.meanStdDevSUV;
      area = data.area;
    } else if (!data.active) {
      // If the data has been invalidated, and the tool is not currently active,
      // We need to calculate it again.

      // Retrieve the bounds of the ROI in image coordinates
      const bounds = {
        left: data.handles[0].x,
        right: data.handles[0].x,
        bottom: data.handles[0].y,
        top: data.handles[0].x
      };

      for (let i = 0; i < data.handles.length; i++) {
        bounds.left = Math.min(bounds.left, data.handles[i].x);
        bounds.right = Math.max(bounds.right, data.handles[i].x);
        bounds.bottom = Math.min(bounds.bottom, data.handles[i].y);
        bounds.top = Math.max(bounds.top, data.handles[i].y);
      }

      const polyBoundingBox = {
        left: bounds.left,
        top: bounds.bottom,
        width: Math.abs(bounds.right - bounds.left),
        height: Math.abs(bounds.top - bounds.bottom)
      };

      // Store the bounding box information for the text box
      data.polyBoundingBox = polyBoundingBox;

      // First, make sure this is not a color image, since no mean / standard
      // Deviation will be calculated for color images.
      if (!image.color) {
        // Retrieve the array of pixels that the ROI bounds cover
        const pixels = cornerstone.getPixels(element, polyBoundingBox.left, polyBoundingBox.top, polyBoundingBox.width, polyBoundingBox.height);

        // Calculate the mean & standard deviation from the pixels and the object shape
        meanStdDev = calculateFreehandStatistics(pixels, polyBoundingBox, data.handles);

        if (modality === 'PT') {
          // If the image is from a PET scan, use the DICOM tags to
          // Calculate the SUV from the mean and standard deviation.

          // Note that because we are using modality pixel values from getPixels, and
          // The calculateSUV routine also rescales to modality pixel values, we are first
          // Returning the values to storedPixel values before calcuating SUV with them.
          // TODO: Clean this up? Should we add an option to not scale in calculateSUV?
          meanStdDevSUV = {
            mean: calculateSUV(image, (meanStdDev.mean - image.intercept) / image.slope),
            stdDev: calculateSUV(image, (meanStdDev.stdDev - image.intercept) / image.slope)
          };
        }

        // If the mean and standard deviation values are sane, store them for later retrieval
        if (meanStdDev && !isNaN(meanStdDev.mean)) {
          data.meanStdDev = meanStdDev;
          data.meanStdDevSUV = meanStdDevSUV;
        }
      }

      // Retrieve the pixel spacing values, and if they are not
      // Real non-zero values, set them to 1
      const columnPixelSpacing = image.columnPixelSpacing || 1;
      const rowPixelSpacing = image.rowPixelSpacing || 1;
      const scaling = columnPixelSpacing * rowPixelSpacing;

      area = freeHandArea(data.handles, scaling);

      // If the area value is sane, store it for later retrieval
      if (!isNaN(area)) {
        data.area = area;
      }

      // Set the invalidated flag to false so that this data won't automatically be recalculated
      data.invalidated = false;
    }

    // Define an array to store the rows of text for the textbox
    const textLines = [];

    // If the mean and standard deviation values are present, display them
    if (meanStdDev && meanStdDev.mean !== undefined) {
      // If the modality is CT, add HU to denote Hounsfield Units
      let moSuffix = '';

      if (modality === 'CT') {
        moSuffix = ' HU';
      }

      // Create a line of text to display the mean and any units that were specified (i.e. HU)
      let meanText = `Mean: ${numberWithCommas(meanStdDev.mean.toFixed(2))}${moSuffix}`;
      // Create a line of text to display the standard deviation and any units that were specified (i.e. HU)
      let stdDevText = `StdDev: ${numberWithCommas(meanStdDev.stdDev.toFixed(2))}${moSuffix}`;

      // If this image has SUV values to display, concatenate them to the text line
      if (meanStdDevSUV && meanStdDevSUV.mean !== undefined) {
        const SUVtext = ' SUV: ';

        meanText += SUVtext + numberWithCommas(meanStdDevSUV.mean.toFixed(2));
        stdDevText += SUVtext + numberWithCommas(meanStdDevSUV.stdDev.toFixed(2));
      }

      // Add these text lines to the array to be displayed in the textbox
      textLines.push(meanText);
      textLines.push(stdDevText);
    }

    // If the area is a sane value, display it
    if (area) {
      // Determine the area suffix based on the pixel spacing in the image.
      // If pixel spacing is present, use millimeters. Otherwise, use pixels.
      // This uses Char code 178 for a superscript 2
      let suffix = ` mm${String.fromCharCode(178)}`;

      if (!image.rowPixelSpacing || !image.columnPixelSpacing) {
        suffix = ` pixels${String.fromCharCode(178)}`;
      }

      // Create a line of text to display the area and its units
      const areaText = `Area: ${numberWithCommas(area.toFixed(2))}${suffix}`;

      // Add this text line to the array to be displayed in the textbox
      textLines.push(areaText);
    }

    // Only render text if polygon ROI has been completed and freehand 'shiftKey' mode was not used:
    if (data.polyBoundingBox && !data.textBox.freehand) {
      // If the textbox has not been moved by the user, it should be displayed on the right-most
      // Side of the tool.
      if (!data.textBox.hasMoved) {
        // Find the rightmost side of the polyBoundingBox at its vertical center, and place the textbox here
        // Note that this calculates it in image coordinates
        data.textBox.x = data.polyBoundingBox.left + data.polyBoundingBox.width;
        data.textBox.y = data.polyBoundingBox.top + data.polyBoundingBox.height / 2;
      }

      // Convert the textbox Image coordinates into Canvas coordinates
      const textCoords = cornerstone.pixelToCanvas(element, data.textBox);

      // Set options for the textbox drawing function
      const textOptions = {
        centering: {
          x: false,
          y: true
        }
      };

      // Draw the textbox and retrieves it's bounding box for mouse-dragging and highlighting
      const boundingBox = drawTextBox(context, textLines, textCoords.x,
        textCoords.y, color, textOptions);

      // Store the bounding box data in the handle for mouse-dragging and highlighting
      data.textBox.boundingBox = boundingBox;

      // If the textbox has moved, we would like to draw a line linking it with the tool
      // This section decides where to draw this line to on the polyBoundingBox based on the location
      // Of the textbox relative to it.
      if (data.textBox.hasMoved) {
        // Draw dashed link line between tool and text

        // Get the nodes of the ROI in canvas coordinates
        const linkAnchorPoints = [];

        for (let i = 0; i < data.handles.length; i++) {
          linkAnchorPoints.push(cornerstone.pixelToCanvas(element, data.handles[i]));
        }

        drawLink(linkAnchorPoints, textCoords, boundingBox, context, color, lineWidth);
      }
    }

    context.restore();
  }
}

// /////// END IMAGE RENDERING ///////
function enable (element) {
  removeEventListeners(element);

  element.addEventListener(EVENTS.IMAGE_RENDERED, onImageRendered);
  external.cornerstone.updateImage(element);
}

// Disables the reference line tool for the given element
function disable (element) {
  removeEventListeners(element);
  external.cornerstone.updateImage(element);
}

// Visible and interactive
function activate (element, mouseButtonMask) {
  setToolOptions(toolType, element, { mouseButtonMask });

  removeEventListeners(element);

  element.addEventListener(EVENTS.IMAGE_RENDERED, onImageRendered);
  element.addEventListener(EVENTS.MOUSE_MOVE, mouseMoveCallback);
  element.addEventListener(EVENTS.MOUSE_DOWN, mouseDownCallback);
  element.addEventListener(EVENTS.MOUSE_DOWN_ACTIVATE, mouseDownActivateCallback);

  external.cornerstone.updateImage(element);
}

// Visible, but not interactive
function deactivate (element, mouseButtonMask) {
  setToolOptions(toolType, element, { mouseButtonMask });

  const eventType = EVENTS.TOOL_DEACTIVATED;
  const statusChangeEventData = {
    mouseButtonMask,
    toolType,
    type: eventType
  };

  triggerEvent(element, eventType, statusChangeEventData);

  removeEventListeners(element);

  element.addEventListener(EVENTS.IMAGE_RENDERED, onImageRendered);
  element.addEventListener(EVENTS.MOUSE_MOVE, mouseMoveCallback);
  element.addEventListener(EVENTS.MOUSE_DOWN, mouseDownCallback);

  external.cornerstone.updateImage(element);
}


function removeEventListeners (element) {
  element.removeEventListener(EVENTS.MOUSE_DOWN, mouseDownCallback);
  element.removeEventListener(EVENTS.MOUSE_DOWN_ACTIVATE, mouseDownActivateCallback);
  element.removeEventListener(EVENTS.MOUSE_DRAG, mouseDragCallback);
  element.removeEventListener(EVENTS.MOUSE_UP, mouseUpCallback);
  element.removeEventListener(EVENTS.MOUSE_MOVE, mouseMoveCallback);
  element.removeEventListener(EVENTS.IMAGE_RENDERED, onImageRendered);
}

function getConfiguration () {
  return configuration;
}

function setConfiguration (config) {
  configuration = config;
}

// Module/private exports
const freehand = {
  enable,
  disable,
  activate,
  deactivate,
  getConfiguration,
  setConfiguration
};

export { freehand };
