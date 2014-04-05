var cornerstoneTools = (function ($, cornerstone, cornerstoneTools) {

    "use strict";

    if(cornerstoneTools === undefined) {
        cornerstoneTools = {};
    }

    function isMouseButtonEnabled(which, mouseButtonMask)
    {
        /*jshint bitwise: false*/
        var mouseButton = (1 << (which - 1));
        return ((mouseButtonMask & mouseButton) !== 0);
    }

    function mouseButtonTool(mouseMoveCallback)
    {
        var toolInterface = {
            activate: function(element, mouseButtonMask) {
                $(element).off('CornerstoneToolsMouseMove', mouseMoveCallback);
                var eventData = {
                    mouseButtonMask: mouseButtonMask
                };
                $(element).on("CornerstoneToolsMouseMove", eventData, mouseMoveCallback);

                //enable(element, mouseButtonMask, onMouseMoveCallback);
            },
            disable : function(element) {$(element).off('CornerstoneToolsMouseDown', mouseMoveCallback);},
            enable : function(element) {$(element).off('CornerstoneToolsMouseDown', mouseMoveCallback);},
            deactivate : function(element) {$(element).off('CornerstoneToolsMouseDown', mouseMoveCallback);},
        };
        return toolInterface;
    }

    // module exports
    cornerstoneTools.mouseButtonTool = mouseButtonTool;
    cornerstoneTools.isMouseButtonEnabled = isMouseButtonEnabled;
    return cornerstoneTools;
}($, cornerstone, cornerstoneTools));