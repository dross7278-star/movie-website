const API_KEY = "74531544";
const API_BASE = "https://www.omdbapi.com/";

const form = document.getElementById("search-form");
const titleInput = document.getElementById("title-input");
const yearInput = document.getElementById("year-input");
const directorInput = document.getElementById("director-input");
const ratingInput = document.getElementById("rating-input");
const clearButton = document.getElementById("clear-button");
const resultsGrid = document.getElementById("results-grid");
const featuredStrip = document.getElementById("featured-strip");
const sortField = document.getElementById("sort-field");
const resultsSummary = document.getElementById("results-summary");
const statusMessage = document.getElementById("status-message");
const UI_STATE_STORAGE_KEY = "action_movies_ui_state";
const allowedMovies = [
	{ title: "Batman" },
	{ title: "Superman" },
];
let currentMovies = [];
let currentView = "home";

function saveUiState() {
	const uiState = {
		title: titleInput.value,
		year: yearInput.value,
		director: directorInput.value,
		rating: ratingInput.value,
		sort: sortField.value,
	};

	try {
		localStorage.setItem(UI_STATE_STORAGE_KEY, JSON.stringify(uiState));
	} catch (error) {
		console.warn("Unable to save UI state.", error);
	}
}

function restoreUiState() {
	try {
		const savedState = localStorage.getItem(UI_STATE_STORAGE_KEY);
		if (!savedState) {
			return;
		}

		const parsedState = JSON.parse(savedState);
		titleInput.value = parsedState.title || "";
		yearInput.value = parsedState.year || "";
		directorInput.value = parsedState.director || "";
		ratingInput.value = parsedState.rating || "";

		if (["title", "year", "rating"].includes(parsedState.sort)) {
			sortField.value = parsedState.sort;
		}
	} catch (error) {
		console.warn("Unable to restore UI state.", error);
	}
}

function setStatus(message, isError = false) {
	statusMessage.textContent = message;
	statusMessage.classList.toggle("error-text", isError);
}

function escapeHtml(value) {
	return String(value ?? "")
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

function normalizeText(value) {
	return String(value ?? "").trim().toLowerCase();
}

function normalizeNumber(value) {
	if (value === undefined || value === null || value === "") {
		return null;
	}

	const numericValue = Number.parseFloat(value);
	return Number.isFinite(numericValue) ? numericValue : null;
}

function getSortField() {
	return sortField.value;
}

function sortMovies(movies) {
	const sortedMovies = [...movies];
	const field = getSortField();

	sortedMovies.sort((firstMovie, secondMovie) => {
		if (field === "rating") {
			const firstRating = normalizeNumber(firstMovie.imdbRating) ?? -1;
			const secondRating = normalizeNumber(secondMovie.imdbRating) ?? -1;
			return secondRating - firstRating;
		}

		if (field === "year") {
			const firstYear = Number.parseInt(firstMovie.Year, 10) || 0;
			const secondYear = Number.parseInt(secondMovie.Year, 10) || 0;
			return secondYear - firstYear;
		}

		return String(firstMovie.Title || "").localeCompare(String(secondMovie.Title || ""));
	});

	return sortedMovies;
}

function updateDisplayedMovies(movies, view = currentView) {
	currentMovies = [...movies];
	currentView = view;
	const sortedMovies = sortMovies(currentMovies);

	if (view === "home") {
		renderFeatured(sortedMovies.slice(0, 8));
		renderMovies(sortedMovies.slice(0, 12));
		return;
	}

	renderMovies(sortedMovies);
}

async function fetchJson(url) {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Request failed with status ${response.status}`);
	}

	return response.json();
}

async function searchByTitle(title, year) {
	const searchParams = new URLSearchParams({
		apikey: API_KEY,
		s: title,
		type: "movie",
	});

	if (year) {
		searchParams.set("y", year);
	}

	const data = await fetchJson(`${API_BASE}?${searchParams.toString()}`);

	if (data.Response === "False") {
		return [];
	}

	const details = await Promise.all(
		(data.Search || []).map(async (movie) => {
			const detailParams = new URLSearchParams({
				apikey: API_KEY,
				i: movie.imdbID,
				plot: "short",
			});

			const detailData = await fetchJson(`${API_BASE}?${detailParams.toString()}`);
			return detailData.Response === "True" ? detailData : movie;
		})
	);

	return details;
}

async function fetchMovieSet(query, year = "") {
	const searchParams = new URLSearchParams({
		apikey: API_KEY,
		s: query,
		type: "movie",
	});

	if (year) {
		searchParams.set("y", year);
	}

	const data = await fetchJson(`${API_BASE}?${searchParams.toString()}`);

	if (data.Response === "False") {
		return [];
	}

	return Promise.all(
		(data.Search || []).slice(0, 10).map(async (movie) => {
			const detailParams = new URLSearchParams({
				apikey: API_KEY,
				i: movie.imdbID,
				plot: "short",
			});

			const detailData = await fetchJson(`${API_BASE}?${detailParams.toString()}`);
			return detailData.Response === "True" ? detailData : movie;
		})
	);
}

async function fetchMovieById(imdbID) {
	const detailParams = new URLSearchParams({
		apikey: API_KEY,
		i: imdbID,
		plot: "short",
	});

	const detailData = await fetchJson(`${API_BASE}?${detailParams.toString()}`);
	return detailData.Response === "True" ? detailData : null;
}

async function fetchMovieByTitle(title) {
	const detailParams = new URLSearchParams({
		apikey: API_KEY,
		t: title,
		plot: "short",
	});

	const detailData = await fetchJson(`${API_BASE}?${detailParams.toString()}`);
	return detailData.Response === "True" ? detailData : null;
}

function matchesFilters(movie, filters) {
	const year = normalizeText(movie.Year);
	const director = normalizeText(movie.Director);
	const rating = normalizeNumber(movie.imdbRating);

	if (filters.year && !year.includes(filters.year)) {
		return false;
	}

	if (filters.director && !director.includes(filters.director)) {
		return false;
	}

	if (filters.rating !== null && (rating === null || rating < filters.rating)) {
		return false;
	}

	return true;
}

function renderEmptyState(message) {
	resultsGrid.innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
}

function renderMovies(movies) {
	if (!movies.length) {
		renderEmptyState("No movies matched your filters. Try a different title, year, director, or rating.");
		return;
	}

	resultsGrid.innerHTML = movies.map((movie) => {
		const poster = movie.Poster && movie.Poster !== "N/A" ? movie.Poster : "https://via.placeholder.com/400x600?text=No+Poster";
		const genres = movie.Genre || "Genre unavailable";
		const plot = movie.Plot && movie.Plot !== "N/A" ? movie.Plot : "Plot unavailable.";

		return `
			<article class="movie-card">
				<img src="${escapeHtml(poster)}" alt="Poster for ${escapeHtml(movie.Title || 'movie')}">
				<div>
					<h2>${escapeHtml(movie.Title || "Untitled")}</h2>
					<p>${escapeHtml(genres)}</p>
				</div>
				<div class="movie-meta">
					<p><span>Year:</span> ${escapeHtml(movie.Year || "Unknown")}</p>
					<p><span>Director:</span> ${escapeHtml(movie.Director || "Unknown")}</p>
					<p><span>Rating:</span> ${escapeHtml(movie.imdbRating || "N/A")}/10</p>
				</div>
				<p>${escapeHtml(plot)}</p>
			</article>
		`;
	}).join("");
}

function renderShelfMovies(movies) {
	return movies.map((movie) => {
		const poster = movie.Poster && movie.Poster !== "N/A" ? movie.Poster : "https://via.placeholder.com/400x600?text=No+Poster";
		return `
			<article class="shelf-card">
				<img src="${escapeHtml(poster)}" alt="Poster for ${escapeHtml(movie.Title || 'movie')}">
				<div class="shelf-overlay">
					<h3>${escapeHtml(movie.Title || "Untitled")}</h3>
					<p>${escapeHtml(movie.Year || "Unknown year")}</p>
				</div>
			</article>
		`;
	}).join("");
}

function renderFeatured(moviesBySection) {
	featuredStrip.innerHTML = moviesBySection
		.map((movie) => {
			const poster = movie.Poster && movie.Poster !== "N/A" ? movie.Poster : "https://via.placeholder.com/400x600?text=No+Poster";
			return `
				<article class="shelf-card">
					<img src="${escapeHtml(poster)}" alt="Poster for ${escapeHtml(movie.Title || 'movie')}">
					<div class="shelf-overlay">
						<h3>${escapeHtml(movie.Title || "Untitled")}</h3>
						<p>${escapeHtml(movie.Year || "Unknown year")} • ${escapeHtml(movie.Genre || "Genre")}</p>
					</div>
				</article>
			`;
		})
		.join("");
}

async function loadHomeShelves() {
	if (!allowedMovies.length) {
		currentMovies = [];
		currentView = "home";
		featuredStrip.innerHTML = "";
		resultsSummary.textContent = "No preset titles have been provided yet.";
		setStatus("Search by title to load movies.");
		resultsGrid.innerHTML = `<div class="empty-state">No preset titles have been provided yet. Search by title to load movies.</div>`;
		return;
	}

	setStatus("Loading featured movies...");
	resultsSummary.textContent = "Featured movies and search results appear here.";
	resultsGrid.innerHTML = `<div class="empty-state">Loading featured movies...</div>`;

	try {
		const movies = (await Promise.all(allowedMovies.map((movie) => fetchMovieByTitle(movie.title)))).filter(Boolean);
		updateDisplayedMovies(movies, "home");
		resultsSummary.textContent = "Featured movies on the home shelf.";
		setStatus("Browse the featured rows or search for something specific.");
	} catch (error) {
		console.error(error);
		resultsSummary.textContent = "Featured movies unavailable";
		setStatus("Unable to load featured movies right now.", true);
		resultsGrid.innerHTML = `<div class="error-state">${escapeHtml("Unable to load featured movies right now.")}</div>`;
	}
}

async function runSearch(event) {
	event?.preventDefault();
	saveUiState();

	const title = normalizeText(titleInput.value);
	const rawTitle = titleInput.value.trim();
	const year = normalizeText(yearInput.value);
	const director = normalizeText(directorInput.value);
	const rating = normalizeNumber(ratingInput.value);

	if (!allowedMovies.length) {
		resultsSummary.textContent = "No approved titles are configured.";
		setStatus("Add an approved title before searching.", true);
		resultsGrid.innerHTML = `<div class="error-state">No approved titles are configured.</div>`;
		return;
	}

	const matchingAllowedMovies = rawTitle
		? allowedMovies.filter((movie) => normalizeText(movie.title).includes(title))
		: [...allowedMovies];

	if (!matchingAllowedMovies.length) {
		resultsSummary.textContent = "Title not approved";
		setStatus("Only approved titles can be searched.", true);
		resultsGrid.innerHTML = `<div class="error-state">Only approved titles can be searched.</div>`;
		return;
	}

	const searchQuery = rawTitle || "all approved titles";

	resultsSummary.textContent = `Searching for ${searchQuery}...`;
	setStatus("Loading movies...");
	featuredStrip.innerHTML = "";
	resultsGrid.innerHTML = `<div class="empty-state">Loading movies...</div>`;

	try {
		const movies = (await Promise.all(matchingAllowedMovies.map((movie) => fetchMovieByTitle(movie.title)))).filter(Boolean);
		const filteredMovies = movies.filter((movie) => matchesFilters(movie, { year, director, rating }));

		resultsSummary.textContent = `${filteredMovies.length} movie${filteredMovies.length === 1 ? "" : "s"} shown`;
		setStatus(filteredMovies.length ? "Results ready." : "No matches found.");
		updateDisplayedMovies(filteredMovies, "search");
	} catch (error) {
		console.error(error);
		resultsSummary.textContent = "Search failed";
		setStatus("Unable to load movies right now. Please try again.", true);
		resultsGrid.innerHTML = `<div class="error-state">${escapeHtml("Unable to load movies right now. Please try again.")}</div>`;
		currentMovies = [];
	}
}

function clearSearch() {
	form.reset();
	saveUiState();
	loadHomeShelves();
	titleInput.focus();
}

function handleSortChange() {
	saveUiState();

	if (!currentMovies.length) {
		return;
	}

	updateDisplayedMovies(currentMovies, currentView);
}

form.addEventListener("submit", runSearch);
clearButton.addEventListener("click", clearSearch);
sortField.addEventListener("change", handleSortChange);
titleInput.addEventListener("input", saveUiState);
yearInput.addEventListener("input", saveUiState);
directorInput.addEventListener("input", saveUiState);
ratingInput.addEventListener("input", saveUiState);

restoreUiState();
loadHomeShelves();
