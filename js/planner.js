// extend d3 functionality
(function() {
    d3.selection.prototype.moveToFront = function() {  
        return this.each(function(){
            this.parentNode.appendChild(this);
        });
    };
    d3.selection.prototype.moveToBack = function() {  
        return this.each(function() { 
            var firstChild = this.parentNode.firstChild; 
            if (firstChild) { 
                this.parentNode.insertBefore(this, firstChild); 
            } 
        });
    };
})();

$(document).ready(function() { 
    timeline = {
        dataURL: "data/a7s.json",
        classURL: "data/classes/",
        iconDir: "resources/icons/",
        bounds: {},
        hPadding: 80,
        topPadding: 80,
        bottomPadding: 120,
        hScale: 38, // pixels second
        vScale: 100,
        dotRadius: 19,
        nodes: [],
        links: [],
        placed: {},
        selected: [],
        selectedSkill: null,
        selectedClass: "sch",
        tooltip: {
            width: 250,
            height: 250
        }
    };

    // get the class data
    d3.json(timeline.classURL + timeline.selectedClass + ".json", function(data) {
        console.log(data);

        var selectedSkill = "whispering_dawn";
        timeline.selectedSkill = {
            id: selectedSkill,
            data: data.skills[selectedSkill]
        };
    });

    // get the fight data
    d3.json(timeline.dataURL, function(data) {
        console.log(data);
        
        timeline.events = data.events;
        timeline.iconDir = data.resources.icons;
        timeline.screenshots = data.resources.screenshots;
        recurseTimeline(data.timeline, [{next: []}], 0);
        timeline.bounds = calculateBounds(timeline.nodes, timeline.hScale, timeline.vScale);

        render(timeline);
    });

    var render = function(timeline) {
        var trailingSpace = 100;
        var jQContainer = $('#container')[0];
        var xOffset = 10 + timeline.dotRadius;
        // var lineElevation = 0.25 * timeline.dotRadius;
        var container = d3.select("#container")
                            .append("svg")
                            .attr("width", 3*xOffset + (timeline.bounds.maxTime + (10 - timeline.bounds.maxTime % 10)) * timeline.hScale)
                            .attr("height", timeline.bounds.totalHeight + timeline.topPadding + timeline.bottomPadding);
        
        // initialise defs for icons/effects
        var defs = container.append("defs");
        initialiseDefs(defs, timeline);
        
        var lineSegment = d3.line()
                            .x(function(d) { return d.left; })
                            .y(function(d) { return d.top; });

        // draw the time line
        renderTimeline(container, timeline, xOffset);
        // draw links
        renderLinks(container, timeline);
        // draw nodes and vertical connecting lines
        renderNodes(container, timeline, xOffset, lineSegment)
        // add the planning bar
        renderPlanningBar(container, timeline, xOffset);
        // drag functionality
        initDragBehaviour(container);
        
    };

    var initialiseDefs = function(defs, timeline) {
        // create filter for glow
        var filter = defs.append("filter")
                            .attr("id","glow")
                            .attr('filterUnits', "userSpaceOnUse")
                            .attr("width", "300%")
                            .attr("height", "300%");
        filter.append("feGaussianBlur")
            //   .attr("stdDeviation","4.5")
                .attr("stdDeviation","4.5")
                .attr("result","blur");
        filter.append("feBlend")
                .attr("in", "SourceGraphic")
                .attr("in2", "blur")
                .attr("mode", "normal");

        // create pattern for including images on nodes
        for (e in timeline.events) {
            var pattern = defs.append("pattern")
                            .attr("id", e)
                            .attr("x", "0")
                            .attr("y", "0")
                            .attr("width", "40px")
                            .attr("height", "40px");
            pattern.append("image")
                .attr("x", "-1")
                .attr("y", "0")
                .attr("width", "40px")
                .attr("height", "34px")
                .attr("xlink:href", timeline.iconDir + timeline.events[e].icon);
        }
    }

    var renderTimeline = function(svg, timeline, xOffset) {
        var lineElevation = 0.25 * timeline.dotRadius;
        var timelineLine = d3.line()
                                .x(function(d) { return d.left; })
                                .y(function(d) { return d.top; });

        svg.append("path")
                    .attr("d", timelineLine([
                        { left: xOffset,
                        top: timeline.bounds.totalHeight + timeline.topPadding + timeline.bottomPadding - 40 - timeline.dotRadius },
                        { left: xOffset + (timeline.bounds.maxTime + (10 - timeline.bounds.maxTime % 10)) * timeline.hScale,
                        top: timeline.bounds.totalHeight + timeline.topPadding + timeline.bottomPadding - 40 - timeline.dotRadius }]))
                    .attr("stroke", "grey")
                    .attr("fill", "none");
        var i = 0;

        // draw time markers up to the next multiple of ten past the end
        while (i <= timeline.bounds.maxTime + (10 - timeline.bounds.maxTime % 10)) {
            var yCoefficient = (i % 10 == 0) ? 2 : 1;
            var strokeWidth = (i % 10 == 0) ? "2px" : "1px";
            var from = {
                left: xOffset + i * timeline.hScale, 
                top: timeline.bounds.totalHeight + timeline.topPadding + timeline.bottomPadding - 40 - timeline.dotRadius - yCoefficient * lineElevation
            }
            var to = {
                left: xOffset + i * timeline.hScale, 
                top: timeline.bounds.totalHeight + timeline.topPadding + timeline.bottomPadding - 40 - timeline.dotRadius + yCoefficient * lineElevation
            }

            svg.append("path")
                        .attr("d", timelineLine([from, to]))
                        .attr("stroke", "grey")
                        .attr("fill", "none")
                        .style("stroke-width", strokeWidth);
            
            // apply a label every 10 segments
            if (i % 10 == 0) {
                text = svg.append("text")
                            .classed("timeline-label", true)
                            .text(function(t) { return (i < 60) ? i + "s" : secondsAndMinutes(i); })
                            .attr("x", function(t) {
                            var translation = this.getComputedTextLength() / 2;
                            return xOffset + i * timeline.hScale - translation;
                            })
                            .attr("y", timeline.bounds.totalHeight + timeline.topPadding + timeline.bottomPadding - 40 - timeline.dotRadius - yCoefficient * lineElevation - 5)
            }
            
            i++;
        }
    };

    var renderLinks = function(svg, timeline) {
        var lineFunction = d3.line()
                                .curve(d3.curveBasis)
                                .x(function(d) { return d.left; })
                                .y(function(d) { return d.top + Math.abs(timeline.bounds.minHeight) + timeline.dotRadius + timeline.topPadding; });

        timeline.links.shift();
        for (l in timeline.links) {
            svg.append("path")
                        .attr("d", lineFunction(timeline.links[l]))
                        .attr("stroke", "grey")
                        .attr("fill", "none");
        }
    };

    var renderNodes = function(svg, timeline, xOffset, lineSegment) {
        var tooltip = d3.select(".tooltip");
        
        for (n in timeline.nodes) {
            var thisNode = timeline.nodes[n];
            var from = {
                left: xOffset + thisNode.left, 
                top: thisNode.top + timeline.topPadding + timeline.bottomPadding + timeline.dotRadius
            }
            var to = {
                left: xOffset + thisNode.left, 
                top: timeline.bounds.totalHeight + timeline.topPadding + timeline.bottomPadding - 40 - timeline.dotRadius
            }

            svg.append("path")
                        .datum(timeline.nodes[n])
                        .classed("timeline-line", true)
                        .attr("d", lineSegment([from, to]))
                        .attr("stroke", "green");
            svg.append("circle")
                        .datum(timeline.nodes[n])
                        .classed("timeline-dot", true)
                        .attr("cx", xOffset + thisNode.left)
                        .attr("cy", timeline.bounds.totalHeight + timeline.topPadding + timeline.bottomPadding - 40 - timeline.dotRadius)
                        .on("mouseover", function(e) {
                            svg.selectAll(".timeline-line")
                                    .classed("hover", function(e) { return e.hover; });
                            svg.selectAll(".timeline-dot")
                                    .classed("hover", function(e) { return e.hover; });
                        })
                        .on("mouseout", function(n) {
                            svg.selectAll(".timeline-line")
                                    .classed("hover", function(n) { return n.hover; });
                            svg.selectAll(".timeline-dot")
                                    .classed("hover", function(n) { return n.hover; });
                        });
        }

        svg.selectAll(".nodeImage")
                    .data(timeline.nodes)
                    .enter()
                    .append("rect")
                    .classed("nodeImage", true)
                    .classed("selected", function(n) { return n.selected; })
                    .attr("y", function(n) { return n.top + Math.abs(timeline.bounds.minHeight) + timeline.topPadding; })
                    .attr("x", function(n) { return n.left + 0.5 * timeline.dotRadius; })
                    .attr("rx", function(n) { return timeline.dotRadius/3; })
                    .attr("ry", function(n) { return timeline.dotRadius/3; })
                    .attr("width", function(n) { return timeline.dotRadius*2; })
                    .attr("height", function(n) { return timeline.dotRadius*2; })
                //  .style("fill", function(n) { return "#777"; })
                    .style("cursor", "pointer");

        svg.selectAll(".nodes")
                    .data(timeline.nodes)
                    .enter()

                    .append("rect")
                    .classed("nodes", true)
                    .attr("y", function(n) { return n.top + Math.abs(timeline.bounds.minHeight) + timeline.topPadding; })
                    .attr("x", function(n) { return n.left + 0.5 * timeline.dotRadius; })
                    .attr("rx", function(n) { return timeline.dotRadius/3; })
                    .attr("ry", function(n) { return timeline.dotRadius/3; })
                    .attr("width", function(n) { return timeline.dotRadius*2; })
                    .attr("height", function(n) { return timeline.dotRadius*2; })
                    .style("fill", function(n) { return "url(#" + n.name + ")"; })
                    .style("filter", "none")
                    .style("cursor", "pointer")
                    .on("mouseover", function(n) {
                    n.hover = true;
                    var e = timeline.events[n.name];
                    
                    d3.select(".tooltip .name")
                        .text(timeline.events[n.name].name);
                    d3.select(".tooltip .icon")
                        .attr("src", timeline.iconDir + timeline.events[n.name].icon);
                    d3.select(".tooltip .naturaltime")
                        .text(secondsAndMinutes(n.time));
                    d3.select(".tooltip .seconds")
                        .text(n.time + "s");
                    d3.select(".tooltip .description-text")
                        .text(timeline.events[n.name].description);
                    
                    var infoText = timeline.events[n.name].info + ((n.info !== undefined) ? "<br /><br /><i class=\"fa fa-info-circle\"></i> " + n.info : "");
                    d3.select(".tooltip .info-text")
                        .html(infoText.replace(/^(<br\ \/>)+/, ""));
                    
                    var x = Math.max(d3.event.pageX - timeline.tooltip.width / 2, 10);
                    var y = $($('svg')[0]).position().top + n.top + Math.abs(timeline.bounds.minHeight) + timeline.dotRadius + timeline.topPadding - $($('.tooltip')[0]).height();

                    d3.select(this).style("filter", "url(#glow)");
                    
                    tooltip.transition()
                            .duration(100)
                            .style("opacity", 0.9);
                    tooltip.style("left", x + "px")
                            .style("top", y - 50 + "px");
                    
                    svg.selectAll(".timeline-line")
                                .classed("hover", function(e) { return e.hover; });
                    svg.selectAll(".timeline-dot")
                                .classed("hover", function(e) { return e.hover; });
                    })
                    .on("mouseout", function(n) {
                    n.hover = false;

                    d3.select(this).style("filter", "none");

                    tooltip.transition()		
                            .duration(100)		
                            .style("opacity", 0)
                            .on("end", function(d) {
                                d3.select(this)
                                    .style("left", "-1000px")
                                    .style("top", "-1000px");
                            });
                    
                    svg.selectAll(".timeline-line")
                                .classed("hover", function(n) { return n.hover; });
                    svg.selectAll(".timeline-dot")
                                .classed("hover", function(n) { return n.hover; });
                    svg.selectAll(".nodeImage")
                                .classed("selected", function (n) { return n.selected; });
                    })
                    .on("click", function(n) {
                        console.log({ id: n.name, left: n.left, top: n.top, selected: n.selected });
                        if (n.selected) {
                        n.selected = false;
                        if (timeline.selected.indexOf(n) > -1)
                            timeline.selected.splice(timeline.selected.indexOf(n), 1);
                        } else {
                        n.selected = true;
                        timeline.selected.push(n);
                        }

                        // update the underlying shape
                        svg.selectAll(".nodeImage")
                                .classed("selected", function (n) { return n.selected; });
                        svg.selectAll(".timeline-dot")
                                .classed("selected", function(n) { return n.selected; });                                        
                    });
    };

    var renderPlanningBar = function(svg, timeline, xOffset) {
        var g = svg.append("g");
                        //  .on("mouseenter", function() {
                        //      //  var x = d3.event.x + $("#container").scrollLeft() - $(window).width();
                        //     //  var x = Math.max(xOffset, d3.event.x - timeline.dotRadius + $("#container").scrollLeft());
                        //      var xCalc = d3.event.x - timeline.dotRadius + $("#container").scrollLeft();
                        //      var xMax = (timeline.bounds.maxTime + (10 - timeline.bounds.maxTime % 10)) * timeline.hScale;// - timeline.dotRadius;
                        //      var x = clamp(xOffset, xCalc, xMax);
                                
                        //      g.append("rect")
                        //       .classed("placing", true)
                        //       .attr("x", x)
                        //       .attr("y", 1)
                        //       .attr("rx", 5)
                        //       .attr("ry", 5)
                        //       .attr("width", 2*timeline.dotRadius)
                        //       .attr("height", 2*timeline.dotRadius)
                        //       .attr("fill", "#777")
                        //       .attr("stroke", "white");
                        //  })
                        //  .on("mousemove", function() {
                        //      var xCalc = d3.event.x - timeline.dotRadius + $("#container").scrollLeft();
                        //      var xMax = (timeline.bounds.maxTime + (10 - timeline.bounds.maxTime % 10)) * timeline.hScale;// - timeline.dotRadius;
                        //      var x = clamp(xOffset, xCalc, xMax);
                        //      d3.select(".placing")
                        //      .attr("x", x)
                        //  })
                        //  .on("mouseleave", function() {
                        //      d3.select(".placing").remove();
                        //  })
                    g.on("click", function(d) {
                        var xCalc = d3.event.x - timeline.dotRadius + $("#container").scrollLeft();
                        var xMax = (timeline.bounds.maxTime + (10 - timeline.bounds.maxTime % 10)) * timeline.hScale;// - timeline.dotRadius;
                        var x = clamp(xOffset, xCalc, xMax);

                        var placed = {
                            skill: timeline.selectedSkill,
                            time: x,
                            overlapping: false
                        }
                        if (timeline.placed[timeline.selectedSkill.id] === undefined) {
                            placed.id = 0;
                            timeline.placed[timeline.selectedSkill.id] = [placed];
                        } else {
                            placed.id = timeline.placed[timeline.selectedSkill.id].length + 1;
                            timeline.placed[timeline.selectedSkill.id].push(placed);
                        }

                        // TODO: loop through all placed skills
                        //       flag the most recently placed if overlapping
                        //       unflag any flagged skills if no longer overlapping 

                        redrawSkills(svg, g, xOffset);
                    });
        g.append("rect")
                    .classed("planning-bar", true)
                    .attr("x", xOffset)
                    .attr("y", 1)
                    .attr("width", (timeline.bounds.maxTime + (10 - timeline.bounds.maxTime % 10)) * timeline.hScale)
                    .attr("height", 2*timeline.dotRadius)
                    .style("cursor", "pointer")
                    .style("pointer-events", "all");
        
        // cooldown blocks
        svg.append("rect")
            .classed("cooldown-block", true)
            .classed("cooldown", true)
            .classed("visible", false)
            .attr("x", function(d) { return xOffset; })
            .attr("y", function(d) { return 2*timeline.dotRadius; })
            .attr("width", function(d) { return 0; })
            .attr("height", function(d) { return timeline.bounds.totalHeight + timeline.topPadding + timeline.bottomPadding - 40 - 3*timeline.dotRadius; })
            .moveToBack();

        svg.append("rect")
            .classed("cooldown-block", true)
            .classed("duration", true)
            .classed("visible", false)
            .attr("x", function(d) { return xOffset; })
            .attr("y", function(d) { return 2*timeline.dotRadius; })
            .attr("width", function(d) { return 0; })
            .attr("height", function(d) { return timeline.bounds.totalHeight + timeline.topPadding + timeline.bottomPadding - 40 - 3*timeline.dotRadius; })
            .moveToBack();
    };

    var redrawSkills = function(svg, gParent, xOffset) {
        for (s in timeline.placed) {
            var thisSkill = timeline.placed[s];
            // add group for every skill
            var g = gParent.selectAll("g")
                            .data(thisSkill, function(d, i) {  return thisSkill.indexOf(d); });

            var skillGroup = g.enter()
                                .append("g")
                                .attr("transform", function(d) { return "translate(" + d.time + ", 0)"; })
                                .call(d3.drag()
                                .on("drag", function(d) {
                                    var xMax = (timeline.bounds.maxTime + (10 - timeline.bounds.maxTime % 10)) * timeline.hScale;// - timeline.dotRadius;
                                    var xCalc = d3.event.x - timeline.dotRadius;
                                    var x = clamp(xOffset, xCalc, xMax);

                                    d3.select(this)
                                        .attr("transform", function(d) { return "translate(" + x + ", 0)"; })
                                        .attr("x", x);
                                    
                                    d.time = x;

                                    // duration box
                                    svg.select(".cooldown-block.duration")
                                        .attr("x", x + timeline.dotRadius);
                                    // cooldown box
                                    svg.select(".cooldown-block.cooldown")
                                        .attr("x", x + d.skill.data.duration * timeline.hScale + timeline.dotRadius);
                                })
                                .on("start", function(d) {
                                    dragStart = d.time;
                                })
                                .on("end", function(d) { }));;

            // add duration bar
            skillGroup.append("rect")
                        .classed("placed-duration", true)
                        .attr("x", function(d) { return timeline.dotRadius; })
                        .attr("y", 10)
                        .attr("width", function(d) { return d.skill.data.duration * timeline.hScale })
                        .attr("height", 4);
            
            // add cooldown bar
            skillGroup.append("rect")
                        .classed("placed-cooldown", true)
                        .attr("x", function(d) { return timeline.dotRadius; })
                        .attr("y", 5)
                        .attr("width", timeline.selectedSkill.data.cooldown * timeline.hScale)
                        .attr("height", 4);

            // add duration circle
            skillGroup.append("circle")
                        .classed("end-circle", true)
                        .attr("cx", function(d) { return d.skill.data.duration * timeline.hScale + timeline.dotRadius; })
                        .attr("cy", 12)
                        .attr("r", 4);
            
            // add cooldown circle
            skillGroup.append("circle")
                        .classed("end-circle", true)
                        .attr("cx", function(d) { return d.skill.data.cooldown * timeline.hScale + timeline.dotRadius; })
                        .attr("cy", 7)
                        .attr("r", 4);

            // add skill rect
            skillGroup.append("rect")
                        .classed("placed", true)
                        .attr("width", 2*timeline.dotRadius)
                        .attr("height", 2*timeline.dotRadius)
                        .on("click", function(d) {
                            d3.event.stopPropagation();

                            if (timeline.focusedSkill == d) {
                                timeline.focusedSkill = null;
                                
                                gParent.selectAll(".focused")
                                        .classed("focused", false);

                                svg.selectAll(".cooldown-block")
                                    .classed("visible", false);
                            } else {
                                gParent.selectAll(".focused")
                                        .classed("focused", false);
                                
                                console.log(gParent.selectAll(".focused"))
                                timeline.focusedSkill = d;

                                // highlight new node
                                var parent = d3.select(this.parentNode)
                                parent.moveToFront();
                                parent.selectAll(".placed,.placed-duration,.placed-cooldown,.end-circle")
                                        .classed("focused", true);
                                
                                // adjust cooldown block
                                svg.select(".cooldown-block.duration")
                                    .classed("visible", true)
                                    .attr("x", function(d) { return timeline.focusedSkill.time + timeline.dotRadius; })
                                    .attr("width", function(d) { return timeline.focusedSkill.skill.data.duration * timeline.hScale; });
                                svg.select(".cooldown-block.cooldown")
                                    .classed("visible", true)
                                    .attr("x", function(d) { return timeline.focusedSkill.time + timeline.focusedSkill.skill.data.duration * timeline.hScale + timeline.dotRadius; })
                                    .attr("width", function(d) { return (timeline.focusedSkill.skill.data.cooldown - timeline.focusedSkill.skill.data.duration) * timeline.hScale; });
                            }

                            return false;
                        })
                        .on("dblclick", function(d) {
                            d3.event.stopPropagation();
                            if (thisSkill.indexOf(d) > -1)
                                thisSkill.splice(thisSkill.indexOf(d), 1);
                            
                            svg.selectAll(".cooldown-block")
                                .classed("visible", false);

                            redrawSkills(svg, gParent, xOffset);
                            return false;
                        })
                        .on("mouseover", function(d) {
                            // unfocus previously focused segment
                            if (timeline.hoveredSkill && timeline.hoveredSkill != d)
                                gParent.selectAll(".hovered")
                                        .classed("hovered", false);
                            
                            // focus new skill
                            timeline.hoveredSkill = d;
                            
                            var parent = d3.select(this.parentNode)
                            parent.moveToFront();
                            parent.selectAll(".placed-duration,.placed-cooldown,.end-circle")
                                .classed("hovered", true);

                            redrawSkills(svg, gParent, xOffset);
                        })
                        .on("mouseout", function(d) {
                            var parent = d3.select(this.parentNode)
                            parent.moveToFront();
                            parent.selectAll(".placed-duration,.placed-cooldown,.end-circle")
                                .classed("hovered", false);
                        });

            g.exit().remove();
        }
    };

    var checkCooldownIntersection = function(placed, skill, position) {
        console.log(placed);
        console.log(skill);
        console.log(position);

        // check whether skill being placed would intersect the cooldown of any already placed skills
        // check whether the cooldown of the skill being placed would intersect already placed skills

        return true;
    }

    var initDragBehaviour = function(svg) {
        svg.call(d3.drag()
                    .on("drag", function() {
                        var delta = startDragX - d3.event.x;
                        $($('#container')[0]).scrollLeft(startScrollX + delta);
                    })
                    .on("start", function() {
                        startScrollX = $($('#container')[0]).scrollLeft();
                        startDragX = d3.event.x;
                    })
                    .on("end", function() {}));
    };

    var recurseTimeline = function(data, previous, depth) {
        var precurse = [];
        var event = null;

        for (e in data) {
            if (timeline.nodes == [])
                timeline.nodes.push(event);
            
            event = data[e];

            if (Array.isArray(event)) {
                var recursed = recurseTimeline(event, previous, depth + 1);

                for (n in recursed)
                    precurse.push(recursed[n]);
            } else {
                event.next = [];
                event.previous = [];

                if (precurse.length > 0) {
                    for (p in precurse)
                        precurse[p].next.push(event);
                    
                    event.previous = precurse;
                    precurse = [];
                } else {
                    for (p in previous)
                        previous[p].next.push(event);

                    event.previous = previous;
                }

                timeline.nodes.push(event);
                previous = [event];
            }

            event.depth = depth;
        }

        return (precurse.length > 0) ? precurse : [event];
    };

    var calculateBounds = function(nodes, hScale, vScale) {
        var bounds = {
            maxTime: 0,
            maxWidth: 0,
            maxHeight: 0,
            minHeight: 0
        };
        nodes[0].level = 1;
        nodes[0].top = 0;
        
        nodeCount = [];
        
        // calculate levels
        for (n in nodes) {
            var thisNode = nodes[n];
            if (thisNode.next.length > 0)
                for (m in thisNode.next) {
                    var nextNode = nodes[n].next[m];
                    nextNode.level = parseInt(m) + 1;
                }
        }

        // calculate positions
        for (n in nodes) {
            var thisNode = nodes[n];
            thisNode.left = thisNode.time * hScale;
            thisNode.top = 0;
            if (nodes.indexOf(thisNode) > 0 && thisNode.previous.length == 1 && thisNode.previous[0].next.length == 1) {
                thisNode.top = thisNode.previous[0].top;
            } else if (thisNode.depth > 0) {
                var currentPer = vScale / thisNode.depth;
                var prevNode = thisNode.previous[0];
                var top = prevNode.top + (Math.pow(-1, thisNode.level) * currentPer);
                thisNode.top = top;
            }

            // if combining multiple branches into one, average the y position of previous nodes
            if (thisNode.previous.length > 1) {
                var sum = 0
                for (var p in thisNode.previous) {
                    sum += thisNode.previous[p].top;
                }

                thisNode.top = sum / thisNode.previous.length;
            }

            // calculate the links
            for (var p in thisNode.previous) {
                var first = (thisNode.previous[p].left < thisNode.left) ? thisNode.previous[p] : thisNode;
                var second = (thisNode.previous[p].left < thisNode.left) ? thisNode : thisNode.previous[p];
                var x1 = first.left === undefined ? 0 : first.left + hScale;
                var y1 = first.top === undefined ? 0 : first.top;
                var x2 = second.left === undefined ? 0 : second.left + hScale;
                var y2 = second.top === undefined ? 0 : second.top;

                // add two control points to get a nice bezier curve
                timeline.links.push([
                    { top: y1, left: x1 },
                    { top: y1, left: (x1 + x2) / 2 - ((x2 - x1) / 4) },
                    { top: y2, left: (x1 + x2) / 2 + ((x2 - x1) / 4) },
                    { top: y2, left: x2 }
                ]);
            }

            // bounds of the entire chart
            bounds.maxTime = Math.max(thisNode.time, bounds.maxTime);
            bounds.maxWidth = Math.max(thisNode.left, bounds.maxWidth);
            bounds.maxHeight = Math.max(thisNode.top, bounds.maxHeight); 
            bounds.minHeight = Math.min(thisNode.top, bounds.minHeight);
            bounds.totalHeight = Math.abs(bounds.minHeight) + Math.abs(bounds.maxHeight) + 2*timeline.dotRadius;

            if (!nodeCount[thisNode.time])
                nodeCount[thisNode.time] = [];
            if (!nodeCount[thisNode.time][thisNode.depth])
                nodeCount[thisNode.time][thisNode.depth] = [];
            if (!nodeCount[thisNode.time][thisNode.depth][thisNode.top.toString()])
                nodeCount[thisNode.time][thisNode.depth][thisNode.top.toString()] = [];
                
            nodeCount[thisNode.time][thisNode.depth][thisNode.top.toString()].push(thisNode);
        }

        // make one final pass to perturb overlapping nodes
        for (t in nodeCount)
            for (d in nodeCount[t])
                for (l in nodeCount[t][d])
                    for (i in nodeCount[t][d][l])
                        nodeCount[t][d][l][i].top += i*timeline.dotRadius*2 - (nodeCount[t][d][l].length - 1) * timeline.dotRadius;

        return bounds;
    };

    depthFirst = function(thisNode, depth) {
        var padding = "";
        for (var i = 0; i < depth; i++)
            padding += "\t";

        console.log("[" + depth + "]\t" + padding + thisNode.name + ":" + thisNode.info);

        thisNode.visited = true;

        for (var i = 0; i < thisNode.next.length; i++)
            if (thisNode.next[i].visited === undefined)
                this.depthFirst(thisNode.next[i], depth + 1);
    };

    var secondsAndMinutes = function(date) {
        var str = "";

        str += date % 60 + "s"
        str = parseInt(date /= 60) % 60 + "m" + str

        return str;
    };

    var clamp = function(x1, n, x2) {
        return Math.min(Math.max(x1, n), x2);
    }
});
