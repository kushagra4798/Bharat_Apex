// Default geofence radius for OEM plants (1.5 km)
export const DEFAULT_GEOFENCE_RADIUS_KM = 1.5;

// Fixed OEM Plant Locations with coordinates for Logistics & Telematics
export interface OemPlantLocation {
  id: string;
  name: string;
  location: string;
  lat: number;
  lng: number;
  part: string;
  isHub: boolean;
  radiusKm?: number;
}

export const OEM_PLANTS: OemPlantLocation[] = [
  {
    id: 'oem-tata',
    name: 'Tata Motors',
    location: 'Sanand EV Plant (Gujarat)',
    lat: 22.9868,
    lng: 72.3813,
    part: 'Front Axle Sub-assembly',
    isHub: false,
    radiusKm: 1.5,
  },
  {
    id: 'oem-mahindra',
    name: 'Mahindra & Mahindra',
    location: 'Chakan Line 1 (Pune)',
    lat: 18.761,
    lng: 73.812,
    part: 'Steering Knuckle Castings',
    isHub: false,
    radiusKm: 1.5,
  },
  {
    id: 'oem-msil',
    name: 'Maruti Suzuki',
    location: 'Manesar Line B (Haryana)',
    lat: 28.3516,
    lng: 76.9427,
    part: 'Transmission Gear Blanks',
    isHub: false,
    radiusKm: 1.5,
  },
  {
    id: 'oem-hyundai',
    name: 'Hyundai Motor India',
    location: 'Sriperumbudur (Tamil Nadu)',
    lat: 12.9675,
    lng: 79.9405,
    part: 'Brake Disc Rotors',
    isHub: false,
    radiusKm: 1.5,
  },
  {
    id: 'oem-bajaj',
    name: 'Bajaj Auto',
    location: 'Waluj Complex (Sambhajinagar)',
    lat: 19.865,
    lng: 75.241,
    part: 'Crankcase Covers',
    isHub: false,
    radiusKm: 1.5,
  },
  {
    id: 'hub-chakan',
    name: 'Bharat Apex Chakan Hub (Unit-4)',
    location: 'Chakan MIDC Industrial Complex',
    lat: 18.7587,
    lng: 73.8474,
    part: 'Central Manufacturing Plant',
    isHub: true,
    radiusKm: 1.5,
  },
];
