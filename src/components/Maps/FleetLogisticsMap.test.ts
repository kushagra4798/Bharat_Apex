import { describe, it, expect } from 'vitest';
import { CORRIDORS, INITIAL_TRUCKS } from '../../data/mockData';
import { OEM_PLANTS } from './oemPlants';

describe('Fleet Logistics & Telematics (Leaflet Integration)', () => {
  it('contains valid corridors with realistic highway waypoints in India', () => {
    expect(CORRIDORS.length).toBeGreaterThanOrEqual(4);

    CORRIDORS.forEach((corridor) => {
      expect(corridor.waypoints.length).toBeGreaterThanOrEqual(2);
      expect(corridor.totalDistanceKm).toBeGreaterThan(0);
      expect(corridor.standardDurationHours).toBeGreaterThan(0);

      // Verify all waypoints are in India geographical range (Lat: 8-38, Lng: 68-98)
      corridor.waypoints.forEach((wp) => {
        expect(wp.lat).toBeGreaterThanOrEqual(8);
        expect(wp.lat).toBeLessThanOrEqual(38);
        expect(wp.lng).toBeGreaterThanOrEqual(68);
        expect(wp.lng).toBeLessThanOrEqual(98);
      });
    });
  });

  it('contains dedicated Chakan to Waluj corridor for Bajaj Auto', () => {
    const walujCorridor = CORRIDORS.find((c) => c.id === 'corridor-chakan-waluj');
    expect(walujCorridor).toBeDefined();
    expect(walujCorridor?.name).toContain('Waluj');
    expect(walujCorridor?.totalDistanceKm).toBe(235);
    expect(walujCorridor?.standardDurationHours).toBe(5.5);
    expect(walujCorridor?.waypoints.length).toBeGreaterThanOrEqual(5);

    // Verify Bajaj truck is assigned to this corridor
    const bajajTruck = INITIAL_TRUCKS.find((t) => t.destinationOem === 'Bajaj Auto');
    expect(bajajTruck).toBeDefined();
    expect(bajajTruck?.corridorId).toBe('corridor-chakan-waluj');
  });

  it('ensures all seed truck ETAs are consistent with corridor standard duration and progressPct', () => {
    INITIAL_TRUCKS.forEach((truck) => {
      const corridor = CORRIDORS.find((c) => c.id === truck.corridorId);
      expect(corridor).toBeDefined();

      const totalDurationMinutes = corridor!.standardDurationHours * 60;
      const expectedStandardMinutes = Math.round(
        ((100 - truck.progressPct) * totalDurationMinutes) / 100
      );
      const expectedMinutes = truck.isExpedited
        ? Math.round(expectedStandardMinutes * 0.65)
        : expectedStandardMinutes;

      expect(truck.etaMinutes).toBe(expectedMinutes);
    });
  });

  it('interpolates positions smoothly between waypoints', () => {
    const corridor = CORRIDORS[0]; // Chakan to Sanand
    const waypoints = corridor.waypoints;
    const totalSegments = waypoints.length - 1;

    // Test at 50% progress
    const progressPct = 50;
    const normalized = (progressPct / 100) * totalSegments;
    const segmentIndex = Math.min(Math.floor(normalized), totalSegments - 1);
    const segmentFraction = normalized - segmentIndex;

    const p1 = waypoints[segmentIndex];
    const p2 = waypoints[segmentIndex + 1];

    const interpolatedLat = p1.lat + (p2.lat - p1.lat) * segmentFraction;
    const interpolatedLng = p1.lng + (p2.lng - p1.lng) * segmentFraction;

    expect(typeof interpolatedLat).toBe('number');
    expect(typeof interpolatedLng).toBe('number');
    expect(interpolatedLat).toBeGreaterThanOrEqual(8);
    expect(interpolatedLat).toBeLessThanOrEqual(38);
    expect(interpolatedLng).toBeGreaterThanOrEqual(68);
    expect(interpolatedLng).toBeLessThanOrEqual(98);
  });

  it('verifies active trucks have assigned corridors and initial coordinates', () => {
    expect(INITIAL_TRUCKS.length).toBeGreaterThanOrEqual(5);

    INITIAL_TRUCKS.forEach((truck) => {
      expect(truck.registrationNumber).toMatch(/^[A-Z]{2}-\d{2}-[A-Z]{1,2}-\d{4}$/);
      expect(truck.corridorId).toBeDefined();
      expect(truck.currentLat).toBeGreaterThan(0);
      expect(truck.currentLng).toBeGreaterThan(0);
      expect(truck.speedKmph).toBeGreaterThan(0);
      expect(truck.etaMinutes).toBeGreaterThan(0);
    });
  });

  it('verifies OEM plants and Chakan hub are geographically valid', () => {
    expect(OEM_PLANTS.length).toBeGreaterThanOrEqual(5);
    const hub = OEM_PLANTS.find((p) => p.isHub);
    expect(hub).toBeDefined();
    expect(hub?.name).toContain('Chakan');

    OEM_PLANTS.forEach((plant) => {
      expect(plant.lat).toBeGreaterThanOrEqual(8);
      expect(plant.lat).toBeLessThanOrEqual(38);
      expect(plant.lng).toBeGreaterThanOrEqual(68);
      expect(plant.lng).toBeLessThanOrEqual(98);
    });
  });

  it('verifies each OEM plant gets a geofence radius (default 1.5 km)', () => {
    OEM_PLANTS.forEach((plant) => {
      const radius = plant.radiusKm ?? 1.5;
      expect(radius).toBe(1.5);
    });
  });
});
