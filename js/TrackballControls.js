/**
 * @author Eberhard Graether / http://egraether.com/
 * @author Jessalyn Alvina 
 *		   - change the contextMap position instead of the camera perspective when panning and zooming
 */

THREE.TrackballControls = function ( object, contextMap, scaledMap, pathObjects, intersections, domElement ) {

	THREE.EventDispatcher.call( this );

	var _this = this;
	var STATE = { NONE: -1, PAN: 0, ZOOM: 1, ROTATE: 2, TOUCH_ROTATE: 3, TOUCH_ZOOM: 4, TOUCH_PAN: 5 };

	this.object = object; //observer's position: where the camera is placed within the 3D view
	this.contextMap = contextMap;
	this.scaledMap = scaledMap;
	this.pathObjects = pathObjects;
	this.intersections = intersections;
	this.domElement = ( domElement !== undefined ) ? domElement : document;

	
	// API (public variables)
	this.enabled = true;

	this.screen = { width: 0, height: 0, offsetLeft: 0, offsetTop: 0 };
	this.radius = ( this.screen.width + this.screen.height ) / 4;
	
	this.focusMap;

	this.rotateSpeed = 1.0;
	this.zoomSpeed = 1.2;
	this.panSpeed = 0.3;

	this.noRotate = false;
	this.noZoom = false;
	this.noPan = false;

	this.staticMoving = false;
	this.dynamicDampingFactor = 0.2;
	this.magnifyingFactor = 4.0; //default: 4.0

	this.minDistance = 0;
	this.maxDistance = Infinity;

	this.keys = [ 81 /*Q*/, 87 /*W*/, 69 /*D*/ ];
	
	this.isPathUpdated = false;
	this.scaledIntersections = [];
	this.scaledPointsOnPath = [];

	
	// internals (private variables)
	this.target = new THREE.Vector3(); //observed 3D point: where the camera aims toward

	var lastPosition = new THREE.Vector3();

	var _state = STATE.NONE,
	_prevState = STATE.NONE,

	_eye = new THREE.Vector3(),

	_rotateStart = new THREE.Vector3(),
	_rotateEnd = new THREE.Vector3(),

	_zoomStart = new THREE.Vector2(),
	_zoomEnd = new THREE.Vector2(),

	_touchZoomDistanceStart = 0,
	_touchZoomDistanceEnd = 0,

	_panStart = new THREE.Vector2(),
	_panEnd = new THREE.Vector2();

	// for reset

	this.target0 = this.target.clone();
	this.position0 = this.object.position.clone();
	this.up0 = this.object.up.clone();

	// events

	var changeEvent = { type: 'change' };
	var mouse = new THREE.Vector2();
	var client = new THREE.Vector2();
	
	document.addEventListener( 'mousemove', mousemove, false );


	/////////////
	// methods //
	/////////////
	
	this.handleResize = function () {

		this.screen.width = window.innerWidth;
		this.screen.height = window.innerHeight;

		this.screen.offsetLeft = 0;
		this.screen.offsetTop = 0;

		this.radius = ( this.screen.width + this.screen.height ) / 4;

	};

	this.handleEvent = function ( event ) {

		if ( typeof this[ event.type ] == 'function' ) {

			this[ event.type ]( event );

		}

	};

	
	/**
	 * function getMouseOnScreen
	 * to get a 2D point of mouse pointer
	 */
	this.getMouseOnScreen = function ( clientX, clientY ) {

		return new THREE.Vector2(
			( clientX - _this.screen.offsetLeft ) / _this.radius * 0.5,
			( clientY - _this.screen.offsetTop ) / _this.radius * 0.5
		);

	};

	
	/**
	 * function getMouseProjectionOnBall
	 * to get a 2D point for rotation
	 */
	this.getMouseProjectionOnBall = function ( clientX, clientY ) {

		var mouseOnBall = new THREE.Vector3(
			( clientX - _this.screen.width * 0.5 - _this.screen.offsetLeft ) / _this.radius,
			( _this.screen.height * 0.5 + _this.screen.offsetTop - clientY ) / _this.radius,
			0.0
		);

		var length = mouseOnBall.length();

		if ( length > 1.0 ) {

			mouseOnBall.normalize();

		} else {

			mouseOnBall.z = Math.sqrt( 1.0 - length * length );

		}

		_eye.copy( _this.object.position ).sub( _this.target );

		var projection = _this.object.up.clone().setLength( mouseOnBall.y );
		projection.add( _this.object.up.clone().cross( _eye ).setLength( mouseOnBall.x ) );
		projection.add( _eye.setLength( mouseOnBall.z ) );

		return projection;

	};

	
	/**
	 * function rotateCamera
	 * to perform changing camera perspective
	 * move camera's position (the observer location) to view the same point from a different angle
	 */
	this.rotateCamera = function () {

		var angle = Math.acos( _rotateStart.dot( _rotateEnd ) / _rotateStart.length() / _rotateEnd.length() );

		if ( angle ) {

			var axis = ( new THREE.Vector3() ).crossVectors( _rotateStart, _rotateEnd ).normalize(),
				quaternion = new THREE.Quaternion();

			angle *= _this.rotateSpeed;

			quaternion.setFromAxisAngle( axis, -angle );

			_eye.applyQuaternion( quaternion );
			_this.object.up.applyQuaternion( quaternion ); //rotate camera

			_rotateEnd.applyQuaternion( quaternion );

			if ( _this.staticMoving ) {

				_rotateStart.copy( _rotateEnd );

			} else {

				quaternion.setFromAxisAngle( axis, angle * ( _this.dynamicDampingFactor - 1.0 ) );
				_rotateStart.applyQuaternion( quaternion );

			}

		}

	};

	
	/**
	 * function zoom
	 * to perform zooming
	 */
	this.zoom = function () {
		//zooming with touch device
		if ( _state === STATE.TOUCH_ZOOM ) {
			var factor = _touchZoomDistanceStart / _touchZoomDistanceEnd;
			_touchZoomDistanceStart = _touchZoomDistanceEnd;
			//_eye.multiplyScalar( factor );
			
			if ( //zoom in (set maximum scale)
				 ( factor > 0 && _this.contextMap.scale.x <= 2.2 && _this.contextMap.scale.y <= 2.2 ) ||
				 //zoom out (set minimum scale)
				 ( factor < 0 && _this.contextMap.scale.x >= 0.2 && _this.contextMap.scale.y >= 0.2 )
			   )
			{
				//scale the contextMap
				_this.contextMap.scale.x = _this.contextMap.scale.x + factor;
				_this.contextMap.scale.y = _this.contextMap.scale.y + factor;
			}
		}
		
		//zooming with mouse
		else {
			
			var factor = 0.0;
			
			//zoom in
			if ( ( _zoomStart.y - _zoomEnd.y ) > 0 && 
				 _this.contextMap.scale.x <= _this.magnifyingFactor && _this.contextMap.scale.y <= _this.magnifyingFactor	)		//set maximum scale
			{
				factor = _this.zoomSpeed/100;
			}
			
			//zoom out
			else if ( ( _zoomStart.y - _zoomEnd.y ) < 0 && 
					  _this.contextMap.scale.x >= 0.2 && _this.contextMap.scale.y >= 0.2 ) 	//set minimum scale
			{
				factor = -1.0 * _this.zoomSpeed/100;
			}

			if ( factor != 0.0 ) {				
				//create raycaster to get the mouse position
				var vector = new THREE.Vector3( client.x, client.y, 0 );
				var projector = new THREE.Projector();
				projector.unprojectVector( vector, object );
				var raycaster = new THREE.Raycaster( object.position, vector.sub( object.position ).normalize() );
				var intersects = raycaster.intersectObject( _this.contextMap );
				if ( intersects[0] ) {
					mouse.x = intersects[0].point.x;
					mouse.y = intersects[0].point.y;

					if ( mouse.lengthSq() )
					{
						console.log( "ZOOM" );
				
						//calculate distance between the pointed pixel with the center of contextMap
						var distanceFromCenter = new THREE.Vector2( 
													mouse.x - _this.contextMap.position.x, 
													mouse.y - _this.contextMap.position.y
												 );
						
						var zoomFactorX = (_this.contextMap.scale.x+factor) / _this.contextMap.scale.x;
						var zoomFactorY = (_this.contextMap.scale.y+factor) / _this.contextMap.scale.y;
						
						//calculate the difference between the scaled pixel with the original pixel's position
						var translateX = ( (distanceFromCenter.x * zoomFactorX) - distanceFromCenter.x );
						var translateY = ( (distanceFromCenter.y * zoomFactorY) - distanceFromCenter.y );
						
						//translate context map
						_this.contextMap.translateX( - translateX );
						_this.contextMap.translateY( - translateY );
						
						//scale context map
						_this.contextMap.scale.x += factor;
						_this.contextMap.scale.y += factor;
						_this.contextMap.scale.z += factor;

						//translate & scale children
						for ( var i=0; i < _this.contextMap.children.length; i++ ) {
							_this.contextMap.children[i].translateX( - translateX );
							_this.contextMap.children[i].translateY( - translateY );
							
							_this.contextMap.children[i].scale.x += factor;
							_this.contextMap.children[i].scale.y += factor;
							_this.contextMap.children[i].scale.z += factor;
						}
						
						//translate paths
						for ( var i=0; i < _this.pathObjects.length; i++ ) {
							for ( var j=0; j < _this.pathObjects[i].splineCurve.points.length; j++ ) {
								var dist = _this.pathObjects[i].splineCurve.points[j].clone().sub( mouse );
								
								_this.pathObjects[i].splineCurve.points[j].x = mouse.x + dist.x * zoomFactorX;
								_this.pathObjects[i].splineCurve.points[j].y = mouse.y + dist.y * zoomFactorY;
							}
						}
						this.isPathUpdated = true;
			
						//zoom intersections
						for( var i=0; i < _this.intersections.length; i++ ) {
							var dist = _this.intersections[i].clone().sub( mouse );
								
							_this.intersections[i].x = mouse.x + dist.x * zoomFactorX;
							_this.intersections[i].y = mouse.y + dist.y * zoomFactorY;
						}
					}
				}

				//for static zoom
				if ( _this.staticMoving ) {
					_zoomStart.copy( _zoomEnd );
				}
				
				//for smooth zoom
				else {
					_zoomStart.y += ( _zoomEnd.y - _zoomStart.y ) * this.dynamicDampingFactor;
				}
			}
		}

	};
	
	
	/**
	 * function zoomPartial
	 * to perform partial zooming in order to preserve both context and details
	 */
	this.zoomPartial = function ( lensPosition ) {
		//zooming with touch device
		if ( _state === STATE.TOUCH_ZOOM ) {
			var factor = _touchZoomDistanceStart / _touchZoomDistanceEnd;
			_touchZoomDistanceStart = _touchZoomDistanceEnd;
			_eye.multiplyScalar( factor );
		}
		
		//zooming with mouse
		else {
			mouse.copy( lensPosition );

			_this.scaledMap.position.copy( _this.contextMap.position );
			_this.scaledMap.position.z = -2;
			//_this.scaledMap.scale = _this.contextMap.scale.copy;
			
			//calculate distance between the pointed pixel with the center of contextMap
			var distanceFromCenter = new THREE.Vector2( 
										mouse.x - _this.contextMap.position.x, 
										mouse.y - _this.contextMap.position.y
									 );
			
			var zoomFactorX = _this.magnifyingFactor / _this.contextMap.scale.x;
			var zoomFactorY = _this.magnifyingFactor / _this.contextMap.scale.y;
		
			//calculate the difference between the scaled pixel with the original pixel's position
			var translateX = ( distanceFromCenter.x * zoomFactorX ) - distanceFromCenter.x;
			var translateY = ( distanceFromCenter.y * zoomFactorY ) - distanceFromCenter.y;
		
			//translate focus map
			_this.scaledMap.translateX( - translateX );
			_this.scaledMap.translateY( - translateY );
		
			//scale focus map
			//_this.scaledMap.scale.x = _this.magnifyingFactor;
			//_this.scaledMap.scale.y = _this.magnifyingFactor;
			
			//translate and scale children
			for ( var i=0; i < _this.scaledMap.children.length; i++ ) {
				var child = _this.scaledMap.children[i];
				
				child.position.copy( _this.contextMap.children[i].position );
				child.position.z = -2;
				
				child.translateX( - translateX );
				child.translateY( - translateY );
				
				child.scale.x = _this.magnifyingFactor;
				child.scale.y = _this.magnifyingFactor;
			}
			
			//translate and scale intersection
			_this.scaledIntersections = [];
			for ( var i=0; i < _this.intersections.length; i++ ) {
				var dist = _this.intersections[i].clone().sub( mouse );
								
				_this.scaledIntersections.push( new THREE.Vector3(
													mouse.x + dist.x * zoomFactorX,
													mouse.y + dist.y * zoomFactorY,
													0
											  ) );
			}
			
			//translate points on path
			var tmp = [];
			for ( var i=0; i < _this.scaledPointsOnPath.length; i++ ) {
				var dist = _this.scaledPointsOnPath[i].clone().sub( mouse );
				
				_this.scaledPointsOnPath[i].multiplyScalar(zoomFactorX);
				
				// tmp.push( new THREE.Vector3(
// 												mouse.x + dist.x * zoomFactorX,
// 												mouse.y + dist.y * zoomFactorY,
// 												_this.scaledPointsOnPath[i].z
// 								 		   ) );
			}
			//_this.scaledPointsOnPath = tmp;
		}

	};

	
	/**
	 * function pan
	 * to perform panning
	 * move contextMap according to mouse movement
	 */
	this.pan = function () {
		//calculate the position change
		var mouseChange = _panEnd.clone().sub( _panStart );
		
		if ( mouseChange.lengthSq() ) {
			console.log( "PAN" );
			
			mouseChange.multiplyScalar( _eye.length() * _this.panSpeed );

			var pan = _eye.clone().cross( _this.object.up ).setLength( mouseChange.x );
			pan.add( _this.object.up.clone().setLength( mouseChange.y ) );

			//pan context map
			_this.contextMap.position.sub(pan);
			
			//pan the children
			var objects = _this.contextMap.children;
			for( var i=0; i < objects.length; i++ ) {
				objects[i].position.sub( pan );
			}
			
			//pan paths
			for ( var i=0; i < _this.pathObjects.length; i++ ) {
				for ( var j=0; j < _this.pathObjects[i].splineCurve.points.length; j++ ) {
					_this.pathObjects[i].splineCurve.points[j].sub(pan);
				}
			}
			this.isPathUpdated = true;
			
			//pan intersections
			for( var i=0; i < _this.intersections.length; i++ ) {
				_this.intersections[i].sub( pan );
			}

			if ( _this.staticMoving ) {

				_panStart = _panEnd;

			} else {

				_panStart.add( mouseChange.subVectors( _panEnd, _panStart ).multiplyScalar( _this.dynamicDampingFactor ) );

			}

		}

	};

	this.checkDistances = function () {

		if ( !_this.noZoom || !_this.noPan ) {

			if ( _this.object.position.lengthSq() > _this.maxDistance * _this.maxDistance ) {

				_this.object.position.setLength( _this.maxDistance );

			}

			if ( _eye.lengthSq() < _this.minDistance * _this.minDistance ) {

				_this.object.position.addVectors( _this.target, _eye.setLength( _this.minDistance ) );

			}

		}

	};

	this.update = function () {

		_eye.subVectors( _this.object.position, _this.target );
		
		if ( !_this.noRotate ) {

			_this.rotateCamera();

		}

		if ( !_this.noZoom ) {

			_this.zoom();

		}

		if ( !_this.noPan ) {

			_this.pan();

		}

		_this.object.position.addVectors( _this.target, _eye );

		_this.checkDistances();

		_this.object.lookAt( _this.target );

		if ( lastPosition.distanceToSquared( _this.object.position ) > 0 ) {

			_this.dispatchEvent( changeEvent );

			lastPosition.copy( _this.object.position );

		}

	};

	this.reset = function () {

		_state = STATE.NONE;
		_prevState = STATE.NONE;

		_this.target.copy( _this.target0 );
		_this.object.position.copy( _this.position0 );
		_this.object.up.copy( _this.up0 );

		_eye.subVectors( _this.object.position, _this.target );

		_this.object.lookAt( _this.target );

		_this.dispatchEvent( changeEvent );

		lastPosition.copy( _this.object.position );

	};

	// listeners

	function keydown( event ) {

		if ( _this.enabled === false ) return;

		window.removeEventListener( 'keydown', keydown );

		_prevState = _state;

		if ( _state !== STATE.NONE ) {

			return;

		} else if ( event.keyCode === _this.keys[ STATE.ROTATE ] && !_this.noRotate ) {

			_state = STATE.ROTATE;

		} else if ( event.keyCode === _this.keys[ STATE.ZOOM ] && !_this.noZoom ) {

			_state = STATE.ZOOM;

		} else if ( event.keyCode === _this.keys[ STATE.PAN ] && !_this.noPan ) {

			_state = STATE.PAN;

		}

	}

	function keyup( event ) {

		if ( _this.enabled === false ) return;

		_state = _prevState;

		window.addEventListener( 'keydown', keydown, false );

	}


	function mousedown( event ) {

		if ( _this.enabled === false ) return;

		event.preventDefault();
		event.stopPropagation();

		if ( _state === STATE.NONE ) {

			_state = event.button;

		}

		if ( _state === STATE.ROTATE && !_this.noRotate ) {

			_rotateStart = _rotateEnd = _this.getMouseProjectionOnBall( event.clientX, event.clientY );

		} else if ( _state === STATE.ZOOM && !_this.noZoom ) {

			_zoomStart = _zoomEnd = _this.getMouseOnScreen( event.clientX, event.clientY );

		} else if ( _state === STATE.PAN && !_this.noPan ) {

			_panStart = _panEnd = _this.getMouseOnScreen( event.clientX, event.clientY );

		}

		document.addEventListener( 'mouseup', mouseup, false );

	}

	function mousemove( event ) {
		////
		
		client.x = ( event.clientX / window.innerWidth ) * 2 - 1;
		client.y = - ( event.clientY / window.innerHeight ) * 2 + 1;
		
		////
		
		if ( _this.enabled === false ) return;
		
		event.preventDefault();
		event.stopPropagation();
		
		
		if ( _state === STATE.ROTATE && !_this.noRotate ) {

			_rotateEnd = _this.getMouseProjectionOnBall( event.clientX, event.clientY );

		} else if ( _state === STATE.ZOOM && !_this.noZoom ) {

			_zoomEnd = _this.getMouseOnScreen( event.clientX, event.clientY );

		} else if ( _state === STATE.PAN && !_this.noPan ) {

			_panEnd = _this.getMouseOnScreen( event.clientX, event.clientY );

		}

	}
	

	function mouseup( event ) {

		if ( _this.enabled === false ) return;

		event.preventDefault();
		event.stopPropagation();

		_state = STATE.NONE;

		//document.removeEventListener( 'mousemove', mousemove );
		document.removeEventListener( 'mouseup', mouseup );

	}


	function mousewheel( event ) {

		if ( _this.enabled === false ) return;
		
		////
		
		client.x = ( event.clientX / window.innerWidth ) * 2 - 1;
		client.y = - ( event.clientY / window.innerHeight ) * 2 + 1;
		
		////
		
		event.preventDefault();
		event.stopPropagation();

		var delta = 0;

		if ( event.wheelDelta ) { // WebKit / Opera / Explorer 9

			delta = event.wheelDelta / 40;

		} else if ( event.detail ) { // Firefox

			delta = - event.detail / 3;

		}

		_zoomStart.y += ( 1 / delta ) * 0.05;

	}


	/**
	 * function touchstart
	 * event listener for touch device, when touch starts
	 */
	function touchstart( event ) {

		if ( _this.enabled === false ) return;

		switch ( event.touches.length ) {

			case 1:
				_state = STATE.TOUCH_ROTATE;
				_rotateStart = _rotateEnd = _this.getMouseProjectionOnBall( event.touches[ 0 ].pageX, event.touches[ 0 ].pageY );
				break;

			case 2:
				_state = STATE.TOUCH_ZOOM;
				var dx = event.touches[ 0 ].pageX - event.touches[ 1 ].pageX;
				var dy = event.touches[ 0 ].pageY - event.touches[ 1 ].pageY;
				_touchZoomDistanceEnd = _touchZoomDistanceStart = Math.sqrt( dx * dx + dy * dy );
				break;

			case 3:
				_state = STATE.TOUCH_PAN;
				_panStart = _panEnd = _this.getMouseOnScreen( event.touches[ 0 ].pageX, event.touches[ 0 ].pageY );
				break;

			default:
				_state = STATE.NONE;

		}

	}


	/**
	 * function touchmove
	 * event listener for touch device, when touch is in process
	 */
	function touchmove( event ) {

		if ( _this.enabled === false ) return;

		event.preventDefault();
		event.stopPropagation();

		switch ( event.touches.length ) {

			case 1:
				_rotateEnd = _this.getMouseProjectionOnBall( event.touches[ 0 ].pageX, event.touches[ 0 ].pageY );
				break;

			case 2:
				var dx = event.touches[ 0 ].pageX - event.touches[ 1 ].pageX;
				var dy = event.touches[ 0 ].pageY - event.touches[ 1 ].pageY;
				_touchZoomDistanceEnd = Math.sqrt( dx * dx + dy * dy )
				break;

			case 3:
				_panEnd = _this.getMouseOnScreen( event.touches[ 0 ].pageX, event.touches[ 0 ].pageY );
				break;

			default:
				_state = STATE.NONE;

		}

	}


	/**
	 * function touchend
	 * event listener for touch device, when touch ends
	 */
	function touchend( event ) {

		if ( _this.enabled === false ) return;

		switch ( event.touches.length ) {

			case 1:
				_rotateStart = _rotateEnd = _this.getMouseProjectionOnBall( event.touches[ 0 ].pageX, event.touches[ 0 ].pageY );
				break;

			case 2:
				_touchZoomDistanceStart = _touchZoomDistanceEnd = 0;
				break;

			case 3:
				_panStart = _panEnd = _this.getMouseOnScreen( event.touches[ 0 ].pageX, event.touches[ 0 ].pageY );
				break;

		}

		_state = STATE.NONE;

	}

	this.domElement.addEventListener( 'contextmenu', function ( event ) { event.preventDefault(); }, false );

	this.domElement.addEventListener( 'mousedown', mousedown, false );

	this.domElement.addEventListener( 'mousewheel', mousewheel, false );
	this.domElement.addEventListener( 'DOMMouseScroll', mousewheel, false ); // firefox

	this.domElement.addEventListener( 'touchstart', touchstart, false );
	this.domElement.addEventListener( 'touchend', touchend, false );
	this.domElement.addEventListener( 'touchmove', touchmove, false );

	window.addEventListener( 'keydown', keydown, false );
	window.addEventListener( 'keyup', keyup, false );

	this.handleResize();

};
