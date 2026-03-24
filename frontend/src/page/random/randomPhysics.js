import { Engine, Render, Runner, Bodies, Body, World, Events, Composite } from 'matter-js';
import {
    BALL_RADIUS,
    BOARD_HEIGHT,
    BOARD_WIDTH,
    DEFLECTORS,
    FUNNEL_LEFT_POINTS,
    GOAL_LEFT_POINTS,
    GOAL_LAYOUT,
    MAX_BALL_SPEED,
    PINS,
    STANDBY_INSET,
    STANDBY_Y,
} from './randomLayout.js';

function isMenuBall(body) {
    return body != null && body.label != null && body.label.indexOf('menu-ball-') === 0;
}

function createBallStyle(menu) {
    var color = menu != null ? menu.color : null;
    return {
        fillStyle: color != null && color.fill != null ? color.fill : '#d6e3ff',
        strokeStyle: color != null && color.stroke != null ? color.stroke : '#ffffff',
        lineWidth: 1.2,
    };
}

function buildBallBody(menu, index, x, y, isStaticBall) {
    var ball = Bodies.circle(x, y, BALL_RADIUS, {
        isStatic: isStaticBall,
        label: 'menu-ball-' + index + '-' + menu.id,
        restitution: 0.82,
        friction: 0.005,
        frictionAir: 0.0014,
        density: 0.00135,
        render: createBallStyle(menu),
    });

    ball.plugin = {
        menu: {
            id: menu.id,
            full: menu.full,
            short: menu.short,
            color: menu.color,
        },
        isStandby: isStaticBall === true,
    };

    return ball;
}

function getFunnelHalfWidthAtY(width, y) {
    var centerX = width / 2;
    var points = FUNNEL_LEFT_POINTS;
    var i = 0;

    if (y <= points[0].y) {
        return centerX - points[0].x;
    }

    while (i < points.length - 1) {
        var current = points[i];
        var next = points[i + 1];

        if (y >= current.y && y <= next.y) {
            var ratio = (y - current.y) / (next.y - current.y);
            var x = current.x + (next.x - current.x) * ratio;
            return centerX - x;
        }

        i = i + 1;
    }

    return centerX - points[points.length - 1].x;
}

function getStandbyPositions(width, count) {
    var positions = [];
    var y = STANDBY_Y;
    var halfWidth = getFunnelHalfWidthAtY(width, y) - STANDBY_INSET;
    var leftX = width / 2 - halfWidth;
    var usableWidth = halfWidth * 2;
    var i = 0;

    while (i < count) {
        var ratio = 0.5;
        if (count > 1) {
            ratio = i / (count - 1);
        }

        positions.push({
            x: leftX + usableWidth * ratio,
            y: y,
        });

        i = i + 1;
    }

    return positions;
}

export function createRandomWorld(params) {
    var mountEl = params.mountEl;
    var menuBalls = params.menuBalls;
    var onGoal = params.onGoal;
    var width = params.width || BOARD_WIDTH;
    var height = params.height || BOARD_HEIGHT;

    var engine = Engine.create();
    engine.world.gravity.y = 1.0;

    var render = Render.create({
        element: mountEl,
        engine: engine,
        options: {
            width: width,
            height: height,
            wireframes: false,
            background: '#0a1021',
            pixelRatio: window.devicePixelRatio || 1,
        },
    });

    var runner = Runner.create();

    var ctx = {
        engine: engine,
        render: render,
        runner: runner,
        width: width,
        height: height,
        onGoal: onGoal,
        rankings: [],
        standbyBalls: [],
        finishedBallBodyIds: {},
    };

    buildWalls(ctx);
    buildCurvedFunnel(ctx);
    buildDeflectors(ctx);
    buildPins(ctx);
    buildGoalStructure(ctx);
    registerCollisionEvents(ctx);
    registerDeflectorMotion(ctx);
    registerSpeedLimiter(ctx);
    registerBallTextRenderer(ctx);
    syncStandbyBalls(ctx, menuBalls);

    Runner.run(runner, engine);
    Render.run(render);

    return ctx;
}

function buildWalls(ctx) {
    var width = ctx.width;
    var height = ctx.height;
    var wallStyle = { fillStyle: '#283457' };

    var top = Bodies.rectangle(width / 2, -10, width, 20, {
        isStatic: true,
        render: wallStyle,
    });

    var left = Bodies.rectangle(-10, height / 2, 20, height, {
        isStatic: true,
        render: wallStyle,
    });

    var right = Bodies.rectangle(width + 10, height / 2, 20, height, {
        isStatic: true,
        render: wallStyle,
    });

    World.add(ctx.engine.world, [top, left, right]);
}

function buildCurvedFunnel(ctx) {
    var width = ctx.width;
    var centerX = width / 2;
    var yList = [];
    var walls = [];
    var i = 0;

    while (i < FUNNEL_LEFT_POINTS.length) {
        yList.push(FUNNEL_LEFT_POINTS[i].y);
        i = i + 1;
    }

    i = 0;
    while (i < yList.length - 1) {
        var y1 = yList[i];
        var y2 = yList[i + 1];
        var half1 = getFunnelHalfWidthAtY(width, y1);
        var half2 = getFunnelHalfWidthAtY(width, y2);

        walls.push(createSegment(centerX - half1, y1, centerX - half2, y2, '#3a5488'));
        walls.push(createSegment(centerX + half1, y1, centerX + half2, y2, '#3a5488'));
        i = i + 1;
    }

    World.add(ctx.engine.world, walls);
}

function createSegment(x1, y1, x2, y2, color) {
    var dx = x2 - x1;
    var dy = y2 - y1;
    var length = Math.sqrt(dx * dx + dy * dy);
    var angle = Math.atan2(dy, dx);

    return Bodies.rectangle((x1 + x2) / 2, (y1 + y2) / 2, length, 24, {
        isStatic: true,
        angle: angle,
        render: { fillStyle: color },
    });
}

function buildDeflectors(ctx) {
    if (DEFLECTORS == null || DEFLECTORS.length === 0) {
        return;
    }

    var bodies = DEFLECTORS.map(function (item) {
        var body = Bodies.rectangle(item.x, item.y, item.width, item.height, {
            isStatic: true,
            angle: item.angle,
            restitution: item.bounce != null ? item.bounce : 0.9,
            render: { fillStyle: '#66c8f4' },
        });

        body.label = 'deflector';
        body.plugin = {
            deflector: {
                originX: item.x,
                motionAmplitude: item.motionAmplitude != null ? item.motionAmplitude : 0,
                motionSpeed: item.motionSpeed != null ? item.motionSpeed : 0,
                motionPhase: item.motionPhase != null ? item.motionPhase : 0,
            },
        };

        return body;
    });

    World.add(ctx.engine.world, bodies);
}

function registerDeflectorMotion(ctx) {
    Events.on(ctx.engine, 'beforeUpdate', function (event) {
        var bodies = Composite.allBodies(ctx.engine.world);
        var time = event.timestamp / 1000;
        var i = 0;

        while (i < bodies.length) {
            var body = bodies[i];

            if (body.label === 'deflector' && body.plugin != null && body.plugin.deflector != null) {
                updateDeflectorPosition(body, time);
            }

            i = i + 1;
        }
    });
}

function updateDeflectorPosition(body, time) {
    var config = body.plugin.deflector;
    if (config.motionAmplitude == null || config.motionAmplitude === 0 || config.motionSpeed == null || config.motionSpeed === 0) {
        return;
    }

    var targetX = config.originX + Math.sin(time * config.motionSpeed + config.motionPhase) * config.motionAmplitude;
    var dx = targetX - body.position.x;

    Body.setPosition(body, {
        x: targetX,
        y: body.position.y,
    });
    Body.setVelocity(body, {
        x: dx,
        y: 0,
    });
}

function buildPins(ctx) {
    if (PINS == null || PINS.length === 0) {
        return;
    }

    var bodies = PINS.map(function (item) {
        var body = Bodies.circle(item.x, item.y, item.radius, {
            isStatic: true,
            restitution: item.bounce != null ? item.bounce : 0.96,
            render: { fillStyle: '#9ab4ff' },
        });

        body.label = 'pin';
        body.plugin = {
            pin: {
                bounce: item.bounce != null ? item.bounce : 0.96,
                radius: item.radius,
                pulseStartedAt: -1,
                pulseDuration: 260,
            },
        };

        return body;
    });

    World.add(ctx.engine.world, bodies);
}

function buildGoalStructure(ctx) {
    var width = ctx.width;
    var centerX = width / 2;
    var floorY = GOAL_LAYOUT.floorY;
    var floorThickness = GOAL_LAYOUT.floorThickness;
    var holeWidth = GOAL_LAYOUT.holeWidth;
    var holeHalf = holeWidth / 2;
    var sideMargin = GOAL_LAYOUT.sideMargin;

    var leftFloorWidth = centerX - holeHalf - sideMargin;
    var rightFloorWidth = width - (centerX + holeHalf) - sideMargin;

    var leftFloor = Bodies.rectangle(sideMargin + leftFloorWidth / 2, floorY, leftFloorWidth, floorThickness, {
        isStatic: true,
        render: { fillStyle: '#304166' },
    });

    var rightFloor = Bodies.rectangle(centerX + holeHalf + rightFloorWidth / 2, floorY, rightFloorWidth, floorThickness, {
        isStatic: true,
        render: { fillStyle: '#304166' },
    });

    var goalSegments = [];
    var i = 0;

    while (i < GOAL_LEFT_POINTS.length - 1) {
        var leftStart = GOAL_LEFT_POINTS[i];
        var leftEnd = GOAL_LEFT_POINTS[i + 1];
        var rightStart = {
            x: width - leftStart.x,
            y: leftStart.y,
        };
        var rightEnd = {
            x: width - leftEnd.x,
            y: leftEnd.y,
        };

        goalSegments.push(createSegment(leftStart.x, leftStart.y, leftEnd.x, leftEnd.y, '#4d699f'));
        goalSegments.push(createSegment(rightStart.x, rightStart.y, rightEnd.x, rightEnd.y, '#4d699f'));
        i = i + 1;
    }

    var goalSensor = Bodies.rectangle(centerX, GOAL_LAYOUT.sensorCenterY, holeWidth - 10, GOAL_LAYOUT.sensorHeight, {
        isStatic: true,
        isSensor: true,
        label: 'goal-sensor',
        render: { fillStyle: 'rgba(0,0,0,0)' },
    });

    World.add(ctx.engine.world, [leftFloor, rightFloor].concat(goalSegments, [goalSensor]));
}

function registerCollisionEvents(ctx) {
    Events.on(ctx.engine, 'collisionStart', function (event) {
        var pairs = event.pairs;
        var i = 0;

        while (i < pairs.length) {
            var pair = pairs[i];
            var a = pair.bodyA;
            var b = pair.bodyB;
            var ball = null;

            if (isMenuBall(a) === true && b.label === 'goal-sensor') {
                ball = a;
            } else if (isMenuBall(b) === true && a.label === 'goal-sensor') {
                ball = b;
            }

            if (ball != null) {
                if (ctx.finishedBallBodyIds[ball.id] === true) {
                    i = i + 1;
                    continue;
                }

                ctx.finishedBallBodyIds[ball.id] = true;

                if (ball.plugin != null && ball.plugin.menu != null) {
                    ctx.rankings.push(ball.plugin.menu);
                }

                if (ctx.onGoal != null) {
                    ctx.onGoal(ball.plugin != null ? ball.plugin.menu : null, ctx.rankings.length);
                }
            }

            var pin = null;
            if (isMenuBall(a) === true && b.label === 'pin') {
                ball = a;
                pin = b;
            } else if (isMenuBall(b) === true && a.label === 'pin') {
                ball = b;
                pin = a;
            }

            if (ball != null && pin != null && pin.plugin != null && pin.plugin.pin != null) {
                reflectBallFromPin(ball, pin);
                pin.plugin.pin.pulseStartedAt = ctx.engine.timing.timestamp;
            }

            var deflector = null;
            if (isMenuBall(a) === true && b.label === 'deflector') {
                deflector = b;
            } else if (isMenuBall(b) === true && a.label === 'deflector') {
                deflector = a;
            }

            if (deflector != null) {
                deflector.restitution = 0.8 + Math.random() * 1.4;
            }

            i = i + 1;
        }
    });
}

function reflectBallFromPin(ball, pin) {
    var bounce = 1 + Math.random() * 2;

    var dx = ball.position.x - pin.position.x;
    var dy = ball.position.y - pin.position.y;
    var distance = Math.sqrt(dx * dx + dy * dy) || 1;
    var nx = dx / distance;
    var ny = dy / distance;
    var vx = ball.velocity.x;
    var vy = ball.velocity.y;
    var dot = vx * nx + vy * ny;

    if (dot >= 0) {
        return;
    }

    var scale = 1 + bounce;
    var reflected = {
        x: vx - scale * dot * nx,
        y: vy - scale * dot * ny,
    };

    Body.setVelocity(ball, reflected);
}

function registerSpeedLimiter(ctx) {
    Events.on(ctx.engine, 'beforeUpdate', function () {
        var bodies = Composite.allBodies(ctx.engine.world);
        var i = 0;

        while (i < bodies.length) {
            var body = bodies[i];

            if (isMenuBall(body) === true) {
                limitBodySpeed(body, MAX_BALL_SPEED);
            }

            i = i + 1;
        }
    });
}

function limitBodySpeed(body, maxSpeed) {
    if (maxSpeed == null || maxSpeed <= 0) {
        return;
    }

    var vx = body.velocity.x;
    var vy = body.velocity.y;
    var speed = Math.sqrt(vx * vx + vy * vy);

    if (speed <= maxSpeed || speed === 0) {
        return;
    }

    var ratio = maxSpeed / speed;
    Body.setVelocity(body, {
        x: vx * ratio,
        y: vy * ratio,
    });
}

function registerBallTextRenderer(ctx) {
    Events.on(ctx.render, 'afterRender', function () {
        var canvasContext = ctx.render.context;
        var bodies = Composite.allBodies(ctx.engine.world);
        var now = ctx.engine.timing.timestamp;

        canvasContext.save();
        canvasContext.textAlign = 'center';
        canvasContext.textBaseline = 'middle';
        canvasContext.font = 'bold 22px sans-serif';
        canvasContext.fillStyle = '#0b1330';

        var i = 0;
        while (i < bodies.length) {
            var body = bodies[i];
            if (body.label === 'pin' && body.plugin != null && body.plugin.pin != null) {
                renderPinPulse(canvasContext, body, body.plugin.pin, now);
            }

            if (isMenuBall(body) === true) {
                var shortText = '';
                var textColor = '#0b1330';
                if (body.plugin != null && body.plugin.menu != null) {
                    shortText = body.plugin.menu.short || '';
                    if (body.plugin.menu.color != null && body.plugin.menu.color.text != null) {
                        textColor = body.plugin.menu.color.text;
                    }
                }
                if (shortText.length >= 3) {
                    canvasContext.font = 'bold 18px sans-serif';
                } else {
                    canvasContext.font = 'bold 22px sans-serif';
                }
                canvasContext.fillStyle = textColor;
                canvasContext.fillText(shortText, body.position.x, body.position.y);
            }
            i = i + 1;
        }

        canvasContext.restore();
    });
}

function renderPinPulse(canvasContext, pinBody, pinConfig, now) {
    if (pinConfig.pulseStartedAt == null || pinConfig.pulseStartedAt < 0) {
        return;
    }

    var elapsed = now - pinConfig.pulseStartedAt;
    if (elapsed < 0 || elapsed > pinConfig.pulseDuration) {
        return;
    }

    var progress = elapsed / pinConfig.pulseDuration;
    var radius = pinConfig.radius != null ? pinConfig.radius : 18;
    var ringRadius = radius + 6 + progress * 22;
    var glowRadius = radius + 2 + progress * 10;
    var alpha = 1 - progress;
    var strokeAlpha = 0.68 * alpha;
    var glowAlpha = 0.28 * alpha;

    canvasContext.save();

    canvasContext.beginPath();
    canvasContext.arc(pinBody.position.x, pinBody.position.y, glowRadius, 0, Math.PI * 2);
    canvasContext.fillStyle = 'rgba(196, 222, 255, ' + glowAlpha.toFixed(3) + ')';
    canvasContext.fill();

    canvasContext.beginPath();
    canvasContext.arc(pinBody.position.x, pinBody.position.y, ringRadius, 0, Math.PI * 2);
    canvasContext.lineWidth = 2.2 - progress * 1.2;
    canvasContext.strokeStyle = 'rgba(214, 234, 255, ' + strokeAlpha.toFixed(3) + ')';
    canvasContext.stroke();

    canvasContext.beginPath();
    canvasContext.arc(pinBody.position.x, pinBody.position.y, radius + 1.5 + progress * 5, 0, Math.PI * 2);
    canvasContext.lineWidth = 1.1;
    canvasContext.strokeStyle = 'rgba(255, 255, 255, ' + (0.48 * alpha).toFixed(3) + ')';
    canvasContext.stroke();

    canvasContext.restore();
}

export function syncStandbyBalls(ctx, menuBalls) {
    clearAllDynamicBalls(ctx);

    if (menuBalls == null || menuBalls.length === 0) {
        return;
    }

    var positions = getStandbyPositions(ctx.width, menuBalls.length);
    var standbyBalls = [];
    var i = 0;

    while (i < menuBalls.length) {
        var pos = positions[i];
        standbyBalls.push(buildBallBody(menuBalls[i], i, pos.x, pos.y, true));
        i = i + 1;
    }

    ctx.standbyBalls = standbyBalls;
    World.add(ctx.engine.world, standbyBalls);
}

export function launchAllMenuBallsAtOnce(ctx) {
    var standbyBalls = ctx.standbyBalls || [];
    if (standbyBalls.length === 0) {
        return;
    }

    var launched = [];
    var i = 0;

    ctx.rankings = [];
    ctx.finishedBallBodyIds = {};

    while (i < standbyBalls.length) {
        var standbyBall = standbyBalls[i];
        var menu = standbyBall.plugin.menu;
        var launchedBall = buildBallBody(menu, i, standbyBall.position.x, standbyBall.position.y + 6, false);

        var spread = i - (standbyBalls.length - 1) / 2;
        var vx = spread * 0.004;
        var vy = 0.025;
        Body.setVelocity(launchedBall, { x: vx, y: vy });

        launched.push(launchedBall);
        i = i + 1;
    }

    World.remove(ctx.engine.world, standbyBalls);
    ctx.standbyBalls = [];
    World.add(ctx.engine.world, launched);
}

export function clearAllDynamicBalls(ctx) {
    var allBodies = Composite.allBodies(ctx.engine.world);
    var removeList = [];
    var i = 0;

    while (i < allBodies.length) {
        if (isMenuBall(allBodies[i]) === true) {
            removeList.push(allBodies[i]);
        }
        i = i + 1;
    }

    if (removeList.length > 0) {
        World.remove(ctx.engine.world, removeList);
    }

    ctx.standbyBalls = [];
    ctx.rankings = [];
    ctx.finishedBallBodyIds = {};
}

export function destroyRandomWorld(ctx) {
    if (ctx == null) {
        return;
    }

    Render.stop(ctx.render);
    Runner.stop(ctx.runner);
    World.clear(ctx.engine.world, false);
    Engine.clear(ctx.engine);

    if (ctx.render.canvas != null && ctx.render.canvas.parentNode != null) {
        ctx.render.canvas.parentNode.removeChild(ctx.render.canvas);
    }
}
