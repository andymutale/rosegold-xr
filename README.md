# Rosegold XR

A mobile-friendly 3D Pac-Man experiment built with Three.js. Exploring room-scale XR, spatial maze placement, and the questionable decision to make a simple arcade game considerably more complicated than it needs to be.

*Hopefully before GTA 6.*

## What is this?

I was supposed to be building my niece a game.

Somewhere along the way, I got distracted by another idea. This one involved taking Pac-Man out of its usual little maze and putting it in a 3D environment that could eventually occupy an actual room.

So, naturally, I started writing code.

Rosegold XR is an experiment in browser-based 3D gaming. I'm working on the maze, the gameplay, mobile controls, and the XR side of things. Three.js handles the 3D world; the rest is an ongoing negotiation between what I want the game to do and what I can get working.

The idea is to make something you can actually play, rather than another impressive-looking demo that falls apart the moment somebody touches it.

## The plan

Build a 3D maze. Get the game running on mobile. Then work on placing the maze in physical space using XR.

That last part is where things get interesting. Making a maze appear on a screen is one problem. Making it behave properly when a player moves around it in an immersive environment is another.

I'm interested in finding out how far I can take the idea in the browser before the project starts demanding an entirely different approach.

We'll see.

## Built with

- Three.js
- JavaScript / TypeScript
- Web APIs
- WebXR, where supported

The project is still evolving, so the implementation and supported features may change.

## Running locally

You'll need Node.js and npm.

Clone the repository:

```bash
git clone https://github.com/andymutale/rosegold-xr.git
cd rosegold-xr
```

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Check the available commands with `npm run` if the scripts differ in your checkout.

For mobile and XR testing, use a compatible browser and device. Some immersive features require HTTPS and browser permissions.

## Current status

Work in progress.

I'm still developing the game and exploring the spatial side of it. Features should be considered experimental until they've been tested on the devices they're intended to run on.

There will probably be bugs. There will almost certainly be some questionable code. The idea is to keep working on it until there's a game worth handing to someone else.

Preferably my niece.

## One last thing

Rosegold takes its name from *Rosegold* by WHATUPRG. The connection is personal; I just liked the name.

As for the project itself, we'll see whether this one makes it out of the prototype graveyard.

I've got a niece waiting for a game, a growing collection of ideas, and a deadline that may or may not be enforced by the release of GTA 6.

What could possibly go wrong?

---

Built by [Andy Mutale](https://github.com/andymutale).

*For the record, I am trying to finish this one.*
