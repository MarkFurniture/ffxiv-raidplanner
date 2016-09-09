angular.module('timeline.event', [])
.directive('timeline', ['$compile', 'offset', function($compile, offset) {
    var template = '<div class="timeline" ng-style="style.timeline">\
                        <div class="tl line"></div>\
                    </div>';
    
    return {
        restrict: 'E',
        scope: {
            timeline: '='
        },
        template: template
        // link: function($scope, $element, $attrs) {
        //     console.log("creating timeline");
        //     // for (var i in $scope.timeline) {
        //     //     var event = $scope.timeline[i];
        //     //     console.log("event")
        //     //     console.log(event)

        //     //     if (!Array.isArray(event)) {
        //     //         var dotTemplate = '<div class="event-object dot" style="left: '+ event.time*10 +'px;"></div>';
        //     //         $element.parent().append($compile(dotTemplate)($scope));
        //     //     }
        //     // }


        //     // var dotTemplate = '<div class="event-object dot" style="left: '+ event.time*10 +'px;"></div>';
        //     // var lineTemplate = '<div class="event-object line" style="left: '+ event.time*10 +'px;"></div>';

        //     // $element.parent().append($compile(dotTemplate)($scope));

        //     // $element.parent().append($compile(template)($scope));
        // }
    };
}]);