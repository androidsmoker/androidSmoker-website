(function() {
    var ws;

    var plot;
    var pit = [];
    var probe1 = [];
    var probe2 = [];
    var ambient = [];
    var plot;
    var plotData;
    var plotOptions;

    var offset = new Date().getTimezoneOffset() * 60 * 1000;
    var lastupdate = {
        setpoint: 250,
        control: 'AUTO'
    };

    var alarmlow = 225;
    var alarmhi = 275;
    var playing = false;
    var alarm;

    $(document).ready(function() {
        setupUI();
        connectSocket();
        setupGraph();

        //Position individual elements and update on resize
        $(window).resize(function() {
            position();
            resizeGraph();
        });
        setTimeout(position, 0);

    });


    function setupGraph() {

        $("#graph")
            .width(window.innerWidth)
            .height(window.innerHeight);

        plotData = [{
            label: "pit",
            data: pit
        }, {
            label: "probe1",
            data: probe1
        }, {
            label: "probe2",
            data: probe2
        }, {
            label: "ambient",
            data: ambient
        }];

        plotOptions = {
            colors: ["#d18b2c", "#ff0000", "#919733"],
            series: {
                shadowSize: 0
            }, // drawing is faster without shadows
            xaxis: {
                mode: "time",
                twelveHourClock: true,
                timeformat: "%h:%M",
                position: "top",
                minTickSize: [1, "minute"],
            },
            zoom: {
                interactive: true
            },
            pan: {
                interactive: true
            },
            grid: {
                borderWidth: 0,
                aboveData: true

            }
        };
        plot = $.plot($("#graph"), plotData, plotOptions);

        $("#graph").data("plot", plot);
        $("#graph").data("graphData", {
            data: plotData,
            options: plotOptions
        });
    }


    function setupUI() {

        //inital state
            smokerOffline();

        $('#fanSpeed').hide();
        $('#airflow').hide();
        $("#alarm").css("opacity", 0.3);
        $("#onoff").css("opacity", 0.75);
        // $("#alarmRange").html('');

        //dialogs
        $("#settingsDialog").dialog({
            width: 500,
            autoOpen: false
        });

        $("#alarmDialog").dialog({
            autoOpen: false
        })

        //CLICK interactions
        $("#probe1Label").click(probeClick);
        $("#probe2Label").click(probeClick);

        $("#fan").click(promptSpeed);
        $("#fanSpeed").click(promptSpeed);
        $("#sleep").click(promptSpeed);

        $("#alarm").click(function() {
            $("#alarmDialog").dialog("open");
        })
        $("#alarmRange").click(function() {
            $("#alarmDialog").dialog("open");
        })

        $("#pitTemp").click(changeSetpoint);
        $("#setpoint").click(changeSetpoint);

        $("#settings").click(function() {
            $("#settingsDialog").dialog("open");
        })

        $("#control").click(togglePID);

        $("#alarmButton").button().click(promptAlarmValues);
        $("#onoff").click(toggleAlarm);

        $("#sim").click(function() {
            $("#settingsDialog").dialog("close");
            smokerOnline();
            simulate();
        });

        $("#connectButton").click(function() {
            $("#settingsDialog").dialog("close");
            connectSocket();
        });

     	$("#sendButton").click(function() {
            $("#settingsDialog").dialog("close");
            sendMessage($("#command").val());
        });
    }

    function promptAlarmValues() {
        alarmlow = parseInt($("#alarmlow").val());
        alarmhi = parseInt($("#alarmhi").val());

        $("#alarmRange").html(alarmlow + "-" + alarmhi);
        $("#alarmDialog").dialog("close");
    }

    function togglePID() {
        if (lastupdate.control == 'MANUAL') {
            sendMessage('pid=on');
        } else
            sendMessage('pid=off');
    }

    function toggleAlarm() {
        var onoff = $("#onoff");

        if (onoff.hasClass("on")) {
            onoff.attr("src", "images/off.png");
            onoff.removeClass("on");
            $("#alarm").css("opacity", 0.3);
            $("#onoff").css("opacity", 0.75);
        } else {
            onoff.attr("src", "images/onoff.png");
            onoff.addClass("on");
            $("#alarm").css("opacity", 1.0);
            $("#onoff").css("opacity", 1.0);

        }

        console.log(onoff.attr("src"));
    }

    function promptForCommand() {
        $.prompt("Send Command:", {
            buttons: {
                "Ok": function() {
                    var val = $(this).find("#result").val();
                    var cmd = val;
                    sendMessage(cmd);
                    $(this).dialog("close");
                }
            }
        });

    }

    function changeSetpoint() {
        $.prompt("Setpoint:", {
            defaultResult: lastupdate.setpoint,
            buttons: {
                "Ok": function() {
                    var val = $(this).find("#result").val();
                    var cmd = "setpoint=" + val;
                    sendMessage(cmd);
                    $(this).dialog("close");
                }
            }
        });
    }

    function promptSpeed() {
        $.prompt("Manual Speed:", {
            buttons: {
                "Ok": function() {
                    var val = parseInt($(this).find("#result").val());
                    val =  Math.round((val / 100) * 255);
                    if(val > 255)
                        val = 255;

                    var cmd = "fan=" + val;
                    console.log("sending cmd: ", cmd);
                    if (ws)
                        ws.send(cmd);
                    $(this).dialog("close");
                }
            }
        });
    }

    function probeClick() {
        var $probe = $(this);
        $.prompt("Name:", {
            defaultResult: $probe.html(),
            buttons: {
                "Ok": function() {
                    var val = $(this).find("input").val();
                    console.log("here:", this);
                    $probe.html(val);
                    $(this).dialog("close");
                }
            }
        });
    }

    function processUpdate(obj) {
        //console.log("received msg: " + obj.type);
        if (obj.type == "sensorUpdate") {
            updateSensors(obj.data)
        } else if (obj.type == "autoTune") {
            console.log(obj);
            $("#autoTune").html("kp:" + obj.data.kp + " ki:" + obj.data.ki + " kd:" + obj.data.kd);
        }
        if (obj.type == "cookNames") {
            $("#probe1Label").html(obj.data.probe1Label);
            $("#probe2Label").html(obj.data.probe2Label);
        }
    }





    function alarmDone() {
        playing = false;
        $("#alarmMessage").html("");

    }

    function checkForAlarms(pt) {
        if ($("#onoff").hasClass("on")) {
            //only check alarm if on in ui
            if (pt >= alarmhi || pt <= alarmlow) {
                if (pt <= alarmlow) {
                    $("#alarmMessage").html("Help pit is too cold!");
                } else if (pt >= alarmhi) {
                    $("#alarmMessage").html("Help pit is too hot!");
                }

                if (!playing) {
                    console.log("play it!");
                    playing = true;
                    setTimeout(function() {
                        alarm = new Audio("sounds/Duck.wav");
                        alarm.play();

                        alarm.addEventListener('ended', function() {
                            alarmDone();

                        });
                    }, 0);
                }
            }
        }
    }

    function updateSensors(arduinoData) {
        lastupdate = arduinoData;

        $("#pitTemp").html(arduinoData.pitTemp + "°");

        var pt = parseInt(arduinoData.pitTemp);

        checkForAlarms(pt);

        //turn off alarm if temperature rights itself while alarm playing    
        if (playing && pt > alarmlow && pt < alarmhi && alarm) {
            alarm.pause();
            alarmDone();
        }

        //update sensor data
        $("#probe1Temp").html(arduinoData.probe1Temp + "°");
        $("#probe2Temp").html(arduinoData.probe2Temp + "°");

        var fs = Math.round(parseInt(arduinoData.fanSpeed) / 255 * 100);
        $("#fanSpeed").html(fs+"%");

        arduinoData.ambientTemp = "OFF";

        $("#setpoint").html("SetPoint: " + arduinoData.setpoint + "°F");
        $("#control").html("Control: " + arduinoData.control);

        if (arduinoData.fanSpeed == "0%") {
            $('#sleep').show();
            $('#fanSpeed').hide();
            $('#airflow').hide();
        } else {
            $('#sleep').hide();
            $('#fanSpeed').show();
            $('#airflow').show();
        }

        //plot on graph

        var time = new Date().getTime() - offset;
        if (pit.length >= 500) {
            //adjust the xaxis to show only last 10mins
            plotOptions.xaxis.min = new Date().getTime() - offset - (10 * 60 * 1000);
        }

        pit.push([time, parseFloat(arduinoData.pitTemp)]);
        probe1.push([time, parseFloat(arduinoData.probe1Temp)]);
        probe2.push([time, parseFloat(arduinoData.probe2Temp)]);

        if (pit.length > 500) {
            pit.splice(0, 1);
            probe1.splice(0, 1);
            probe2.splice(0, 1);
        }

        var plot = $("#graph").data("plot");
        plot.setData(plotData);
        plot.setupGrid();
        plot.draw();
    }

    function sendMessage(msg) {
        console.log("will send: " + msg);
        if (ws)
            ws.send(msg);
        else
            console.error("No websocket, cannot send...");

    }

    function smokerOnline() {
        $(".smoke").show();
        flickerFlames();
        $("#signMessage").hide();
        $("#setpoint").show();
        $("#control").show();

    }


    function smokerOffline() {
        $(".smoke").hide();
        $("#signMessage").show();
        $("#setpoint").hide();
        $("#control").hide();
    }


    function connectSocket() {
        // simulate();
        // return;

        stopSim = true;

        if (ws)
            ws.close();

        $("#signMessage").html("Connecting...");
        if ("WebSocket" in window) {
            console.log("connect to: ", $("#wsurl").val());

            ws = new WebSocket($("#wsurl").val());

            setTimeout(monitorConnect, 2000);

            ws.onopen = function() {
                smokerOnline();
            };

            ws.onmessage = function(evt) {
                var str = evt.data;
                var obj = eval("(" + str + ")");
                processUpdate(obj);
            };
            ws.onclose = function(evt) {
                console.log(evt);
            };
            ws.onerror = function(err) {
            	var a = $("<a>", {href: '#'}).html("Simulate data").click(function() {
            		smokerOnline();
            		simulate();
            	})

                $("#signMessage").html('Smoker is offline.<br>').append(a);
            }
        } else {
            alert("WebSocket NOT supported by your Browser!");
        }
    }

    function monitorConnect() {
    	if(ws.readyState == 0) {
    		//still not connected
    		ws.close();
    	}
    }

    function resizeGraph() {
        $("#graph")
            .width(window.innerWidth)
            .height(window.innerHeight);

        setTimeout(function() {
            var graphData = $("#graph").data("graphData");

            console.log(graphData);
            var plot = $.plot($("#graph"), graphData.data, graphData.options);

            $("#graph").data("plot", plot);
        }, 0);
    }

    function position() {

        console.log("SET POSITIONS...");
        $("#smoker").position({
            my: 'center',
            at: 'center',
            of: window
        });
        $("#flames").position({
            my: 'bottom',
            at: 'center+29 bottom-114',
            of: '#smoker'
        });
        $("#smoke").position({
            my: 'bottom',
            at: 'center-15 top-25',
            of: '#smoker'
        });
        $("#smoke1").position({
            my: 'bottom',
            at: 'center+123 top+25',
            of: '#smoker'
        });

        $("#pitTemp").position({
            my: 'center bottom',
            at: 'center+45 bottom-100',
            of: '#smoker'
        });

        $("#probe2").position({
            my: 'left bottom',
            at: 'right-200 top+250',
            of: '#smoker'
        });
        $("#probe1").position({
            my: 'right bottom',
            at: 'left+175 top+225',
            of: '#smoker'
        });

        $("#probe1Temp").position({
            my: 'center bottom',
            at: 'left+80 center',
            of: '#probe1'
        });
        $("#probe1Label").position({
            my: 'center top',
            at: 'center bottom',
            of: '#probe1Temp'
        });

        $("#probe2Temp").position({
            my: 'center bottom',
            at: 'right-80 center',
            of: '#probe2'
        });
        $("#probe2Label").position({
            my: 'center top',
            at: 'right-80 center-10',
            of: '#probe2'
        });



        $("#platform").position({
            my: 'center+100 center',
            at: 'bottom',
            of: '#smoker'
        });

        $("#signpost").position({
            my: 'bottom',
            at: 'right-150 center',
            of: '#platform',
            collision: 'none'
        });
        $("#signMessage").position({
            my: 'top',
            at: 'center+20 top+120',
            of: '#signpost'
        });
        $("#setpoint").position({
            my: 'left top',
            at: 'left+100 center-140',
            of: '#signpost'
        });
        $("#control").position({
            my: 'left top',
            at: 'left+100 center-100',
            of: '#signpost'
        });
        
        $("#settings").position({
            my: 'center',
            at: 'right-35 top+245',
            of: '#signpost'
        });

        $("#fan").position({
            my: 'center',
            at: 'center+200 top-25',
            of: '#platform',
            collision: 'none'

        });

        $("#sleep").position({
            my: 'left bottom',
            at: 'center+10 center-25',
            of: '#fan'

        });

        $("#fanSpeed").position({
            my: 'left bottom',
            at: 'center+15 center-30',
            of: '#fan'

        });

        $("#airflow").position({
            my: 'center',
            at: 'center50 center',
            of: '#fan'
        });

        $("#alarm").position({
            my: 'right center',
            at: 'left+40 center+27',
            of: '#smoker'
        });

        $("#onoff").position({
            my: 'center',
            at: 'right-30 top+30',
            of: '#alarm'
        });

        $("#alarmRange").position({
            my: 'center',
            at: 'center+28 center-40',
            of: '#alarm'
        });

        $("#alarmMessage").position({
            my: 'right',
            at: 'left+30 center+60',
            of: '#alarm'
        });
    }

    function flickerFlames() {
        var opacity = $("#flames").css("opacity");

        var lo = 0.4;
        var hi = 1.0;

        if (opacity == lo)
            opacity = hi;
        else if (opacity == hi)
            opacity = lo;
        else
            return; //called during animation

        $("#flames").animate({
            opacity: opacity
        }, 1000, 'swing', flickerFlames);
    }


    //SIMULATION for testing

    var simData = {
        pitTemp: 250,
        probe1Temp: 100,
        probe2Temp: 0,
        fanSpeed: '100%',
        setpoint: 300,
        control: 'AUTO'
    }
    var stopSim = false;

    function random(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;

    }

    function simulate() {
        stopSim = false;
        
        processUpdate({
            type: 'cookNames',
            data: {
                probe1Label: 'Pork Butt',
                probe2Label: 'Brisket'
            }
        })
        setTimeout(nextTick, 1000);
    }

    var easeOutQuad = function(t, b, c, d) {
        return Math.floor(-c * (t /= d) * (t - 2) + b);
    };

    var elapsed = 0;
    var TOTAL = 1000 * 60 * 5; //5mins
    function nextTick() {
        elapsed += 1000;

        simData.pitTemp = random(245, 255);
        if (simData.pitTemp > 250)
            simData.fanSpeed = "0%";
        else
            simData.fanSpeed = random(1, 100) + '%';

        if (simData.probe1Temp < 190)
            simData.probe1Temp = easeOutQuad(elapsed, 50, 140, TOTAL);

        simData.probe2Temp = random(160, 165);

        processUpdate({
            type: 'sensorUpdate',
            data: simData
        });

        if(!stopSim)
            simulate();
    }
})();
