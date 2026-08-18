import { useEffect, useMemo, useState } from 'react'
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  CircleMarker,
  Popup,
  useMap,
} from 'react-leaflet'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import L from 'leaflet'
import './App.css'

const HYDERABAD_CENTER = [17.385, 78.4867]

function FitGrid({ grid }) {
  const map = useMap()

  useEffect(() => {
    if (!grid) return

    const layer = L.geoJSON(grid)
    const bounds = layer.getBounds()

    if (bounds.isValid()) {
      map.fitBounds(bounds, {
        padding: [30, 30],
      })
    }
  }, [grid, map])

  return null
}

function App() {
  const [grid, setGrid] = useState(null)
  const [predictions, setPredictions] = useState([])
  const [stations, setStations] = useState([])
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedCell, setSelectedCell] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function loadData() {
      try {
        const [gridRes, predictionsRes, stationsRes] =
          await Promise.all([
            fetch('/data/grid.geojson'),
            fetch('/data/predictions.json'),
            fetch('/data/station_grid_mapping.csv'),
          ])

        if (!gridRes.ok) {
          throw new Error('Could not load grid.geojson')
        }

        if (!predictionsRes.ok) {
          throw new Error('Could not load predictions.json')
        }

        if (!stationsRes.ok) {
          throw new Error(
            'Could not load station_grid_mapping.csv',
          )
        }

        const gridData = await gridRes.json()
        const predictionData = await predictionsRes.json()
        const stationText = await stationsRes.text()

        setGrid(gridData)
        setPredictions(predictionData)
        setStations(parseCSV(stationText))

        const availableDates = [
          ...new Set(
            predictionData
              .map((item) => item.date)
              .filter(Boolean),
          ),
        ].sort()

        if (availableDates.length > 0) {
          setSelectedDate(availableDates[0])
        }
      } catch (err) {
        console.error(err)
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [])

  const dates = useMemo(() => {
    return [
      ...new Set(
        predictions
          .map((item) => item.date)
          .filter(Boolean),
      ),
    ].sort()
  }, [predictions])

  const datePredictions = useMemo(() => {
    const result = new Map()

    predictions
      .filter((item) => item.date === selectedDate)
      .forEach((item) => {
        result.set(String(item.grid_id), item)
      })

    return result
  }, [predictions, selectedDate])

  const statistics = useMemo(() => {
    const values = [...datePredictions.values()]
      .map((item) => Number(item.predicted_no2))
      .filter(Number.isFinite)

    if (values.length === 0) {
      return {
        average: null,
        maximum: null,
        minimum: null,
        count: 0,
      }
    }

    return {
      average:
        values.reduce(
          (sum, value) => sum + value,
          0,
        ) / values.length,

      maximum: Math.max(...values),

      minimum: Math.min(...values),

      count: values.length,
    }
  }, [datePredictions])

  /*
   * Build the time series for the selected cell.
   */
  const selectedCellHistory = useMemo(() => {
    if (!selectedCell) {
      return []
    }

    return predictions
      .filter(
        (item) =>
          String(item.grid_id) ===
          String(selectedCell.gridId),
      )
      .map((item) => ({
        date: item.date,
        predicted_no2: Number(
          item.predicted_no2,
        ),
        actual_no2: Number(
          item.actual_no2,
        ),
      }))
      .filter((item) =>
        Number.isFinite(item.predicted_no2),
      )
      .sort((a, b) =>
        String(a.date).localeCompare(
          String(b.date),
        ),
      )
  }, [predictions, selectedCell])

  function getGridStyle(feature) {
    const gridId = String(feature.properties.grid_id)
    const prediction = datePredictions.get(gridId)

    if (!prediction) {
      return {
        fillOpacity: 0,
        opacity: 0.25,
        weight: 0.5,
      }
    }

    return {
      fillColor: getNO2Color(
        prediction.predicted_no2,
        statistics.minimum,
        statistics.maximum,
      ),
      fillOpacity: 0.72,
      color: '#ffffff',
      weight: 0.35,
      opacity: 0.5,
    }
  }

  function onEachGridCell(feature, layer) {
    const gridId = String(feature.properties.grid_id)
    const prediction = datePredictions.get(gridId)

    layer.bindTooltip(
      `<strong>${gridId}</strong><br/>Predicted NO₂: ${
        prediction
          ? formatNumber(prediction.predicted_no2)
          : 'No data'
      }`,
      {
        sticky: true,
      },
    )

    layer.on({
      mouseover: (event) => {
        event.target.setStyle({
          weight: 2,
          color: '#ffffff',
          fillOpacity: 0.9,
        })
      },

      mouseout: (event) => {
        event.target.setStyle(
          getGridStyle(feature),
        )
      },

      click: () => {
        setSelectedCell({
          gridId,
          prediction,
        })
      },
    })
  }

  function changeDate(direction) {
    const currentIndex =
      dates.indexOf(selectedDate)

    if (currentIndex === -1) return

    const nextIndex =
      currentIndex + direction

    if (
      nextIndex >= 0 &&
      nextIndex < dates.length
    ) {
      setSelectedDate(dates[nextIndex])
      setSelectedCell(null)
    }
  }

  if (loading) {
    return (
      <div className="app loading-screen">
        <div className="loading-card">
          <div className="loading-dot" />

          <h2>
            Loading Hyderabad NO₂ data
          </h2>

          <p>
            Preparing the 1 km prediction grid...
          </p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="app loading-screen">
        <div className="loading-card error-card">
          <h2>
            Unable to load dashboard data
          </h2>

          <p>{error}</p>

          <code>
            public/data/
          </code>
        </div>
      </div>
    )
  }

  return (
    <div className="app">

      <header className="topbar">
        <div>
          <div className="brand">
            HYDERABAD NO₂
          </div>

          <div className="subtitle">
            Urban Air Quality Intelligence
          </div>
        </div>

        <div className="prototype-badge">
          PROTOTYPE 3
        </div>
      </header>

      <main className="dashboard">

        <section className="hero">
          <p className="eyebrow">
            HIGH-RESOLUTION AIR QUALITY
          </p>

          <h1>
            Hyderabad NO₂
            <span>
              {' '}
              Intelligence Map
            </span>
          </h1>

          <p className="hero-description">
            Explore machine-learning predictions of
            urban nitrogen dioxide across Hyderabad's
            1 km spatial grid.
          </p>
        </section>

        <section className="stats-grid">

          <StatCard
            label="Selected date"
            value={
              selectedDate
                ? formatDate(selectedDate)
                : '--'
            }
          />

          <StatCard
            label="Average predicted NO₂"
            value={formatNumber(
              statistics.average,
            )}
          />

          <StatCard
            label="Maximum predicted NO₂"
            value={formatNumber(
              statistics.maximum,
            )}
          />

          <StatCard
            label="Prediction cells"
            value={statistics.count.toLocaleString()}
          />

          <StatCard
            label="Ground stations"
            value={stations.length}
          />

        </section>

        <section className="dashboard-grid">

          <div className="map-card">

            <div className="map-header">

              <div>
                <h2>
                  Spatial NO₂ distribution
                </h2>

                <p>
                  1 km × 1 km prediction grid
                </p>
              </div>

              <div className="map-date-controls">

                <button
                  onClick={() =>
                    changeDate(-1)
                  }
                  disabled={
                    dates.indexOf(
                      selectedDate,
                    ) <= 0
                  }
                >
                  ‹
                </button>

                <select
                  value={selectedDate}
                  onChange={(event) => {
                    setSelectedDate(
                      event.target.value,
                    )

                    setSelectedCell(null)
                  }}
                >
                  {dates.map((date) => (
                    <option
                      key={date}
                      value={date}
                    >
                      {formatDate(date)}
                    </option>
                  ))}
                </select>

                <button
                  onClick={() =>
                    changeDate(1)
                  }
                  disabled={
                    dates.indexOf(
                      selectedDate,
                    ) ===
                    dates.length - 1
                  }
                >
                  ›
                </button>

              </div>

            </div>

            <div className="map-wrapper">

              <MapContainer
                center={HYDERABAD_CENTER}
                zoom={10}
                scrollWheelZoom
                className="map"
              >

                <TileLayer
                  attribution='© OpenStreetMap contributors © CARTO'
                  url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                />

                <FitGrid grid={grid} />

                {grid && (
                  <GeoJSON
                    key={selectedDate}
                    data={grid}
                    style={getGridStyle}
                    onEachFeature={
                      onEachGridCell
                    }
                  />
                )}

                {stations.map(
                  (station, index) => {
                    const lat = Number(
                      station.latitude,
                    )

                    const lng = Number(
                      station.longitude,
                    )

                    if (
                      !Number.isFinite(lat) ||
                      !Number.isFinite(lng)
                    ) {
                      return null
                    }

                    return (
                      <CircleMarker
                        key={
                          station.station_id ||
                          `${station.station_name}-${index}`
                        }
                        center={[lat, lng]}
                        radius={6}
                        pathOptions={{
                          color: '#ffffff',
                          weight: 2,
                          fillColor:
                            '#111827',
                          fillOpacity: 1,
                        }}
                      >

                        <Popup>

                          <div className="station-popup">

                            <strong>
                              {station.station_name ||
                                'Ground station'}
                            </strong>

                            <span>
                              Station ID:{' '}
                              {station.station_id ||
                                '--'}
                            </span>

                            <span>
                              Grid:{' '}
                              {station.grid_id ||
                                '--'}
                            </span>

                            <span>
                              Latitude:{' '}
                              {lat.toFixed(5)}
                            </span>

                            <span>
                              Longitude:{' '}
                              {lng.toFixed(5)}
                            </span>

                          </div>

                        </Popup>

                      </CircleMarker>
                    )
                  },
                )}

              </MapContainer>

              <div className="map-legend">

                <div className="legend-title">
                  Predicted NO₂
                </div>

                <div className="legend-gradient" />

                <div className="legend-labels">

                  <span>
                    {formatNumber(
                      statistics.minimum,
                    )}
                  </span>

                  <span>
                    {formatNumber(
                      statistics.maximum,
                    )}
                  </span>

                </div>

                <div className="station-legend">

                  <span className="station-dot" />

                  Ground station

                </div>

              </div>

            </div>

          </div>

          <aside className="details-card">

            {selectedCell ? (

              <>

                <div className="details-header">

                  <div>

                    <p className="eyebrow">
                      SELECTED GRID CELL
                    </p>

                    <h2>
                      {selectedCell.gridId}
                    </h2>

                  </div>

                  <button
                    className="close-button"
                    onClick={() =>
                      setSelectedCell(null)
                    }
                  >
                    ×
                  </button>

                </div>

                {selectedCell.prediction ? (

                  <CellDetails
                    prediction={
                      selectedCell.prediction
                    }
                  />

                ) : (

                  <div className="no-data">

                    No prediction is available
                    for this grid cell on the
                    selected date.

                  </div>

                )}

                {selectedCellHistory.length > 1 && (
                  <div className="trend-section">

                    <div className="trend-header">

                      <div>

                        <p className="eyebrow">
                          TEMPORAL ANALYSIS
                        </p>

                        <h3>
                          NO₂ trend
                        </h3>

                      </div>

                      <span className="trend-count">
                        {selectedCellHistory.length}{' '}
                        observations
                      </span>

                    </div>

                    <div className="chart-wrapper">

                      <ResponsiveContainer
                        width="100%"
                        height={220}
                      >

                        <LineChart
                          data={
                            selectedCellHistory
                          }
                          margin={{
                            top: 10,
                            right: 10,
                            left: -20,
                            bottom: 5,
                          }}
                        >

                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="#374151"
                          />

                          <XAxis
                            dataKey="date"
                            stroke="#9ca3af"
                            tickFormatter={
                              formatShortDate
                            }
                            tick={{ fontSize: 10 }}
                          />

                          <YAxis
                            stroke="#9ca3af"
                            tick={{ fontSize: 10 }}
                            tickFormatter={
                              (value) =>
                                Number(
                                  value,
                                ).toFixed(0)
                            }
                          />

                          <Tooltip
                            contentStyle={{
                              background:
                                '#111827',
                              border:
                                '1px solid #374151',
                              borderRadius:
                                '10px',
                              color: '#ffffff',
                            }}
                            labelFormatter={
                              formatDate
                            }
                            formatter={(
                              value,
                              name,
                            ) => [
                              formatNumber(value),
                              name ===
                              'predicted_no2'
                                ? 'Predicted NO₂'
                                : 'Actual NO₂',
                            ]}
                          />

                          <Line
                            type="monotone"
                            dataKey="predicted_no2"
                            stroke="#f97316"
                            strokeWidth={3}
                            dot={{
                              r: 3,
                              fill: '#f97316',
                            }}
                            activeDot={{
                              r: 6,
                            }}
                            name="predicted_no2"
                          />

                          <Line
                            type="monotone"
                            dataKey="actual_no2"
                            stroke="#60a5fa"
                            strokeWidth={2}
                            strokeDasharray="5 5"
                            dot={{
                              r: 3,
                              fill: '#60a5fa',
                            }}
                            name="actual_no2"
                            connectNulls={false}
                          />

                        </LineChart>

                      </ResponsiveContainer>

                    </div>

                    <div className="chart-legend">

                      <span>
                        <i className="predicted-dot" />
                        Predicted
                      </span>

                      <span>
                        <i className="actual-dot" />
                        Ground observation
                      </span>

                    </div>

                  </div>
                )}

              </>

            ) : (

              <div className="empty-details">

                <div className="empty-icon">
                  +
                </div>

                <h2>
                  Select a grid cell
                </h2>

                <p>
                  Click any grid cell on the map
                  to inspect its predicted NO₂,
                  environmental information and
                  temporal trend.
                </p>

              </div>

            )}

          </aside>

        </section>

      </main>

    </div>
  )
}


/* ============================================
   CELL DETAILS
============================================ */

function CellDetails({
  prediction,
}) {
  return (
    <>

      <div className="main-value">

        <span>
          Predicted NO₂
        </span>

        <strong>
          {formatNumber(
            prediction.predicted_no2,
          )}
        </strong>

      </div>

      <div className="detail-list">

        <DetailRow
          label="Date"
          value={formatDate(
            prediction.date,
          )}
        />

        <DetailRow
          label="Actual NO₂"
          value={formatNumber(
            prediction.actual_no2,
          )}
        />

        <DetailRow
          label="AOD"
          value={formatNumber(
            prediction.aod,
          )}
        />

        <DetailRow
          label="NDVI"
          value={formatNumber(
            prediction.ndvi,
          )}
        />

        <DetailRow
          label="Cloud"
          value={formatNumber(
            prediction.cloud,
          )}
        />

        <DetailRow
          label="Population density"
          value={formatNumber(
            prediction.population_density,
          )}
        />

      </div>

      <div className="data-note">

        Ground observations are only available
        at monitoring stations. A missing actual
        value does not mean zero NO₂.

      </div>

    </>
  )
}


/* ============================================
   STAT CARD
============================================ */

function StatCard({
  label,
  value,
}) {
  return (
    <div className="stat-card">

      <span>
        {label}
      </span>

      <strong>
        {value}
      </strong>

    </div>
  )
}


/* ============================================
   DETAIL ROW
============================================ */

function DetailRow({
  label,
  value,
}) {
  return (
    <div className="detail-row">

      <span>
        {label}
      </span>

      <strong>
        {value}
      </strong>

    </div>
  )
}


/* ============================================
   FORMAT NUMBER
============================================ */

function formatNumber(value) {
  const number = Number(value)

  if (!Number.isFinite(number)) {
    return '--'
  }

  return number.toLocaleString(
    undefined,
    {
      maximumFractionDigits: 2,
    },
  )
}


/* ============================================
   FORMAT DATE
============================================ */

function formatDate(date) {
  if (!date) return '--'

  const parsed = new Date(
    `${date}T00:00:00`,
  )

  if (
    Number.isNaN(
      parsed.getTime(),
    )
  ) {
    return date
  }

  return parsed.toLocaleDateString(
    'en-IN',
    {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    },
  )
}


/* ============================================
   SHORT DATE FOR CHART
============================================ */

function formatShortDate(date) {
  if (!date) return ''

  const parsed = new Date(
    `${date}T00:00:00`,
  )

  if (
    Number.isNaN(
      parsed.getTime(),
    )
  ) {
    return date
  }

  return parsed.toLocaleDateString(
    'en-IN',
    {
      day: '2-digit',
      month: 'short',
    },
  )
}


/* ============================================
   NO₂ COLOR SCALE
============================================ */

function getNO2Color(
  value,
  min,
  max,
) {
  const number = Number(value)

  if (!Number.isFinite(number)) {
    return '#6b7280'
  }

  if (
    !Number.isFinite(min) ||
    !Number.isFinite(max) ||
    min === max
  ) {
    return '#f59e0b'
  }

  const ratio = Math.max(
    0,
    Math.min(
      1,
      (number - min) /
        (max - min),
    ),
  )

  if (ratio < 0.33) {
    return interpolateColor(
      '#22c55e',
      '#eab308',
      ratio / 0.33,
    )
  }

  if (ratio < 0.66) {
    return interpolateColor(
      '#eab308',
      '#f97316',
      (ratio - 0.33) /
        0.33,
    )
  }

  return interpolateColor(
    '#f97316',
    '#ef4444',
    (ratio - 0.66) /
      0.34,
  )
}


/* ============================================
   COLOR INTERPOLATION
============================================ */

function interpolateColor(
  color1,
  color2,
  amount,
) {
  const hexToRgb = (
    hex,
  ) => ({
    r: parseInt(
      hex.slice(1, 3),
      16,
    ),

    g: parseInt(
      hex.slice(3, 5),
      16,
    ),

    b: parseInt(
      hex.slice(5, 7),
      16,
    ),
  })

  const rgbToHex = (
    rgb,
  ) => {
    const component = (
      value,
    ) =>
      Math.round(value)
        .toString(16)
        .padStart(2, '0')

    return `#${component(
      rgb.r,
    )}${component(
      rgb.g,
    )}${component(
      rgb.b,
    )}`
  }

  const a =
    hexToRgb(color1)

  const b =
    hexToRgb(color2)

  return rgbToHex({
    r:
      a.r +
      (b.r - a.r) *
        amount,

    g:
      a.g +
      (b.g - a.g) *
        amount,

    b:
      a.b +
      (b.b - a.b) *
        amount,
  })
}


/* ============================================
   CSV PARSER
============================================ */

function parseCSV(text) {
  const lines = text
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)

  if (lines.length < 2) {
    return []
  }

  const headers =
    parseCSVLine(lines[0])

  return lines
    .slice(1)
    .map((line) => {
      const values =
        parseCSVLine(line)

      return headers.reduce(
        (object, header, index) => {
          object[header] =
            values[index] ?? ''

          return object
        },
        {},
      )
    })
}


/* ============================================
   CSV LINE PARSER
============================================ */

function parseCSVLine(line) {
  const result = []

  let current = ''

  let insideQuotes =
    false

  for (
    let i = 0;
    i < line.length;
    i += 1
  ) {
    const char = line[i]

    if (char === '"') {

      if (
        insideQuotes &&
        line[i + 1] === '"'
      ) {
        current += '"'
        i += 1
      } else {
        insideQuotes =
          !insideQuotes
      }

    } else if (
      char === ',' &&
      !insideQuotes
    ) {

      result.push(
        current.trim(),
      )

      current = ''

    } else {

      current += char

    }
  }

  result.push(
    current.trim(),
  )

  return result
}

export default App