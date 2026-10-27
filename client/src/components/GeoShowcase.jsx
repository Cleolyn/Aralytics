import React from 'react';
import Reveal from './Reveal';
import Carousel from './Carousel';
import { Archipelago, LANDMARKS } from './iso/geography';

export default function GeoShowcase() {
  return (
    <>
      <Reveal className="geo-map">
        <div className="geo-map-art"><Archipelago /></div>
        <div className="geo-map-copy">
          <h3>One country, three island groups.</h3>
          <p>The Philippines has more than 7,000 islands. Geographers group them into Luzon in the north, the Visayas in the middle and Mindanao in the south.</p>
          <ul className="legend">
            <li><span style={{ background: '#7d9a55' }} aria-hidden="true" />Luzon</li>
            <li><span style={{ background: '#c9a75e' }} aria-hidden="true" />Visayas</li>
            <li><span style={{ background: '#a8714e' }} aria-hidden="true" />Mindanao</li>
          </ul>
        </div>
      </Reveal>
      <Reveal delay={100}>
        <Carousel title="Wonders of the Philippines" label="Wonders of the Philippines">
          {LANDMARKS.map(({ id, name, place, blurb, Scene }) => (
            <article key={id} className="landmark">
              <div className="landmark-art"><Scene /></div>
              <h4>{name}</h4>
              <p className="landmark-place">{place}</p>
              <p>{blurb}</p>
            </article>
          ))}
        </Carousel>
      </Reveal>
    </>
  );
}
