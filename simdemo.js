dojo.require("dojox.gfx");

// constants adjust speed the robot rotates/moves by multiplying.
rotationConst = 1 / 180;
translationConst = 0.3;

updateRate = 15; // how many frames a second are rendered
updateInt = 1000/updateRate; // update interval in milliseconds

anim_interval = null; // holds ID of setInterval timeout for animation
code_timeout = null; // holds ID of setTimeout timeout for code pauses

// yield str and regex are used for locating yields to replace with tuples
yield_str = "yield"; // string used by code editor
yield_regex = /^(\s*)yield\s+([^#\n]+)\s*(?:#.*)*$/gm;

// Run once on page load
function init ()
{
    // ensure rate counter on page starts at correct value
    document.nextform.rateDisplay.value=updateRate;

    var container = dojo.byId("simDisplay");
    surface = dojox.gfx.createSurface(container, 500, 500);

    setupAnim();

    editor = CodeMirror.fromTextArea('code', {
        parserfile: ["../contrib/python/js/parsepython.js"],
        stylesheet: ["CodeMirror-0.63/contrib/python/css/pythoncolors.css"],
        path: "CodeMirror-0.63/js/",
        lineNumbers: true,
        textWrapping: false,
        indentUnit: 4,
        width: "350px",
        height: "470px",
        parserConfig: {'pythonVersion': 2, 'strictErrors': true}
        });

}

// Triggered by buttons on page.
function changeUpdateRate(val)
{
    updateRate = updateRate + val;
    document.nextform.rateDisplay.value=updateRate;
    updateInt = 1000/updateRate;

    // change update rate in currently running animation
    updateAnim();
}

// Initiated by pressing "Run" button
function loadCode()
{
    // get text from editor
    var code_orig=editor.getCode();

    // find yields in editor
    var yields = findYields();

    // replace yields in text
    var code_mod = replaceYields(code_orig,yields);

    // compile with Skulpt
    var compiled_code = compileCode(code_mod);

    // stopAnim just in case
    stopAnim();

    // start automatic stepping
    startAnim();

    // finally run the code
    var success = runCode(compiled_code);

    if (!success) // stop animation if code failed to run
    {
        stopAnim();
    }
}

// Generate an ordered array of line numbers for lines
//  with a valid yield statement.
function findYields()
{
    var yields = [];
    var searchObj = editor.getSearchCursor(yield_str); // assumes 4-space indentation
    var found = searchObj.findNext(); // true if it finds such a thing
    while (found == true) // loop through all instances of yield
    {
        var content = editor.lineContent(searchObj.line);
        // now need to check if it actually matches the regex:
        if (content.search(yield_regex) != -1)
        {
            var lineNum = editor.lineNumber(searchObj.line);
            yields.push(lineNum);
        }
        found = searchObj.findNext(); // get next result
    }

    return yields;
}

// Goes through the code modifying valid yield statements
//  to pass a tuple, in which the first value is the line number
//  that the yield appeared in (stored in our yield array) and the
//  second value is the original value the yield passed.
function replaceYields(code, yields)
{
    newcode = code.replace(yield_regex,
        function(wholematch, $1, $2)
        {
            var lineNum = yields.shift();
            str = $1 + "yield (" + lineNum + ", " + $2 + ")";
            return str;
        });
    return newcode;
}

// Compile input code with skulpt.
function compileCode(input)
{
    try
    {
        console.log("Code to be compiled:\n", input);

        // Compile python into javascript
        var js = Skulpt.compileStr("face", input);

        if (js === false)
        {
            console.log("Compilation quietly failed.");
        }
        else
        {
            console.log("Compiled code: ", js);
        }
    }
    catch (e)
    {
        console.log("Error compiling code: ", e );
    }
    return js;
}

// Try to run compiled robot code.
//  Then try to creat instance of main() generator
//  which should be defined in robot code.
//  Lastly call loopCode which will keep calling itself with a new value to wait for.
function runCode(robotCode)
{
    try
    {
    eval.call(window, robotCode);
    }
    catch (e)
    {
    console.log("Error running compiled code: ", e);
    return false; // failed
    }

    try
    {
    robotCodeGen = main();
    }
    catch (e)
    {
    console.log("Error creating main() generator instance: ", e);
    return false; // failed
    }

    loopCode();
    return true; // succeeded
}

// Step once through user code generator.
//  Use the yielded value to:
//  * highlight relevent line in user code
//  * setup loopCode to be called again after specified time.
function loopCode()
{
    try
    {
        var yielded = robotCodeGen.next();
    }
    catch(e)
    {
        // this should catch a StopIteration style error when
        //  the generator has completed but currently skulpt doesn't do that.
        console.log("Error running code?, ", e);
        return;
    }
    if (yielded != undefined)
    {
        var waitfor = yielded.v[1] * 1000;

        var lineNum = parseInt(yielded.v[0]);
        selectLine(lineNum);

        //console.log("yielding for: ", waitfor/1000, " seconds, line ", lineNum);

        code_timeout = setTimeout(loopCode, waitfor);
    }
    else
    {
        console.log("finished running code");
        stopAnim(); // stop animation
    }
}

// Find line in editor, check length and select.
function selectLine(lineNum)
{
    var line = editor.nthLine(lineNum);
    var lineLen = editor.lineContent(line).length;
    editor.selectLines(line, 0, line, lineLen);
}

// Setup new animation
function setupAnim()
{
    stopAnim(); // stop any running animation

    // initial values on animation creation/reset.
    motorspeed = {a:0, b:0};
    robot_pos = {x: 250, y: 250}; // absolute
    robot_rot = 0; // absolute, in radians

    // clear gfx surface
    surface.clear();

    var robot_points = [{x: -20, y: -20}, {x: -20, y: 20}, {x: 0, y: 10}, {x: 20, y: 20}, {x: 20, y: -20}, {x: -20, y: -20}];

    robot = surface.createPolyline(robot_points)
            .setStroke({color: "black", width: 2})
            .setFill("#889");

    robot.setTransform( makeTransformMatrix(robot_pos.x, robot_pos.y, robot_rot) );

}

// Change automatic updating based on new updateInt
function updateAnim ()
{
    if (anim_interval != null)
    {
    clearInterval(anim_interval); // stop updating display
    anim_interval = setInterval(step, updateInt);
    }
}

// Start automatic updating animation
function startAnim ()
{
    anim_interval = setInterval(step, updateInt);
}

// Stop automatic updating animation
function stopAnim ()
{
    clearInterval(anim_interval); // stop updating display
    clearInterval(code_timeout); // cancel any waiting code timeout
}

// Part of robot programming API.
//  Sets each motor speed individually.
function setspeed (motora, motorb)
{
    motorspeed = {a:motora, b:motorb};
}

// From two motor speeds estimate a rotation component.
function getNewRotation (motorLeft, motorRight)
{
    var difference = (motorLeft - motorRight) * updateInt/1000 * rotationConst;

    var newRot = robot_rot + difference;

    newRot %= Math.PI * 2; // keep value between 0 and 2*PI

    return newRot;
}

// From two motorspeeds and absolute rotation work out
//  forward distance and from this translation coordinates.
function getNewPosition (motorLeft, motorRight, rotation)
{
    var distance = (motorLeft + motorRight) * updateInt/1000 * translationConst / 2;

    var deltaX = -distance * Math.sin(robot_rot);
    var deltaY = distance * Math.cos(robot_rot);

    var posX = robot_pos.x + deltaX;
    var posY = robot_pos.y + deltaY;

    return {x: posX, y: posY};

}

// Create a 2D transformation matrix for the robot.
function makeTransformMatrix (posX, posY, rotation)
{
    // Create a rotation matrix about the origin (robot is drawn with it's centre at the origin).
    var matrix_rot = dojox.gfx.matrix.rotate(rotation);

    // Create a translation matrix from the origin to the new position.
    var matrix_pos = dojox.gfx.matrix.translate(posX, posY);

    // Finally multiply the two matrices together.
    //  The order of multiplication is important.
    var matrix_final = dojox.gfx.matrix.multiply(matrix_pos, matrix_rot);

    return matrix_final;
}

// Update animation by one frame
function step()
{
    var motorLeft = motorspeed.a;
    var motorRight = motorspeed.b;

    // Find and set new position and rotation
    var new_robot_rot = getNewRotation(motorLeft,motorRight);
    var new_robot_pos = getNewPosition(motorLeft, motorRight, robot_rot);

    // Get a new transformation matrix for the new absolute position/rotation details.
    var matrix_final = makeTransformMatrix(new_robot_pos.x, new_robot_pos.y, new_robot_rot);

    // Update position/rotation values:
    robot_rot = new_robot_rot;
    robot_pos = new_robot_pos;

    // Replace the robot transform with the new transformation matrix.
    //    This is a different operation to gfx.shape.applyTransform,
    //    which multiplies a new transform with the existing one.
    robot.setTransform(matrix_final);
}

dojo.addOnLoad(init);
