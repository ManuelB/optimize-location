var parkingLotSource = new ol.source.Vector({
});
  
var parkingLotLayer = new ol.layer.Vector({
    source: parkingLotSource
});

var optimizedLocationSource = new ol.source.Vector({
});
  
var optimizedLocationLayer = new ol.layer.Vector({
    style: function (feature) {
        return new ol.style.Style({
            image: new ol.style.Circle({
              radius: 20,
              fill: new ol.style.Fill({color: 'rgba(255, 0, 0, 0.5)'}),
              stroke: new ol.style.Stroke({color: '#000000', width: 1}),
            })
        });
    },
    source: optimizedLocationSource
});


var map = new ol.Map({
target: 'map',
layers: [
    new ol.layer.Tile({
      source: new ol.source.OSM()
    }),
    parkingLotLayer,
    optimizedLocationLayer
],
view: new ol.View({
    // Center Berlin Charlottenburg
    center: [1480819.581627217, 6891282.817208018],
    zoom: 15.563057093283305
  })
}); 

function optimizeLocation(start, vectorSource, extent) {
    const scorePoint = tf.tensor1d([start[0], start[1]]).variable();
    // finds the closest parking lot
    // calculate distance
    // TODO:
    // use cumulative normal distribution function for judging distance
    // - very close -> very good
    // - far away -> we don't care
    const scoreOfCurrentCoordinates = function () {
        let pointCoordinates = [scorePoint.dataSync()[0], scorePoint.dataSync()[1]];
        let closestParkingLot = vectorSource.getClosestFeatureToCoordinate(pointCoordinates);
        if(closestParkingLot) {
            // distance to start point
            // let fDistance = ol.sphere.getDistance([lat.dataSync()[0], lon.dataSync()[0]], closestParkingLot.getGeometry().getCoordinates());
            var squaredDifference = tf.squaredDifference(scorePoint, tf.tensor1d(closestParkingLot.getGeometry().getCoordinates())).sum().sqrt();
            return squaredDifference;
        } else {
            return tf.tensor1d([Infinity]);
        }
    };

    const learningRate = 10;
    const optimizer = tf.train.sgd(learningRate);
    for (let i = 0; i < 20; i++) {
        optimizer.minimize(scoreOfCurrentCoordinates);
    }
    optimizedLocationSource.clear();
    
    var optimizedLocation = scorePoint.dataSync();

    optimizedLocationSource.addFeature(new ol.Feature({
        geometry: new ol.geom.Point(optimizedLocation)
    }));

}

map.on('moveend', function (evt) {
    var map = evt.map;
    var extent = map.getView().calculateExtent(map.getSize());

    var bottomLeft = ol.proj.toLonLat(ol.extent.getBottomLeft(extent));
    var topRight = ol.proj.toLonLat(ol.extent.getTopRight(extent));

    parkingLotSource.clear();
    fetch("https://lz4.overpass-api.de/api/interpreter", {
        "body": "data=%5Bout%3Ajson%5D%5Btimeout%3A50%5D%3B%0A(%0A++nwr%5B%22amenity%22%3D%22parking%22%5D("+bottomLeft[1]+"%2C"+bottomLeft[0]+"%2C"+topRight[1]+"%2C"+topRight[0]+")%3B%0A)%3B%0Aout+body%3B%0A%3E%3B%0Aout+skel+qt%3B",
        "method": "POST"
    }).then(res => res.json()).then(oResult => {
        let aFeatures = oResult.elements.map(oParking => new ol.Feature({
            geometry: new ol.geom.Point(ol.proj.fromLonLat([oParking.lon, oParking.lat]))
        }));
        parkingLotSource.addFeatures(aFeatures);

        optimizeLocation(map.getView().getCenter(), parkingLotSource, extent);
    }).catch(e => {
        console.error(e);
    });
});
