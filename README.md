# Novara

Novara is a full-stack platform for reading, writing, and managing books, audiobooks, and user content. This project is a refactored version of the original "Novara" platform, with all branding, localStorage keys, and backend references updated to "Novara".

## Features
- Reader and writer dashboards
- Book and audiobook management
- Admin analytics and user management
- LocalStorage migration logic for seamless upgrade from Novara
- Modern, modular JavaScript frontend
- Node.js/Express backend with Prisma ORM
- Dockerized deployment

## Project Structure
- **/admin-*.js, .html, .css**: Admin dashboard modules
- **/reader-*.js, .html, .css**: Reader dashboard modules
- **/writer-*.js, .html, .css**: Writer dashboard modules
- **/backend/**: Node.js/Express backend, Prisma, controllers, models, routes
- **/books/**: Book data (JSON, TXT)
- **/data/**: Additional data files
- **/library.js, .html, .css**: Library and discovery modules
- **/profile.js, .html, .css**: User profile modules
- **/settings.js, .html, .css**: User settings modules
- **/docker-compose.yml**: Docker configuration

## Setup
1. Clone the repository
2. Install dependencies in `/backend` (`npm install`)
3. Set up your `.env` file in `/backend` (see `.env.example`)
4. Run the backend server (`npm start` in `/backend`)
5. Open `index.html` in your browser for the frontend
6. (Optional) Use Docker: `docker-compose up`

## Migration from Novara
- On first load, Novara will migrate all localStorage keys from the old "novara." prefix to "novara." automatically.
- No user data is lost in the upgrade.

## Contributing
Pull requests are welcome! Please open an issue first to discuss major changes.

## License
MIT License
