/* =========================================
   PICKPRIME MAIN JAVASCRIPT
   ========================================= */


/* MOBILE MENU */

function toggleMenu() {

  const menu = document.getElementById("mainMenu");

  if (!menu) return;

  menu.classList.toggle("active");

}


/* CLOSE MOBILE MENU AFTER CLICK */

document.addEventListener("DOMContentLoaded", function () {

  const menu = document.getElementById("mainMenu");

  if (!menu) return;

  const links = menu.querySelectorAll("a");

  links.forEach(function (link) {

    link.addEventListener("click", function () {

      menu.classList.remove("active");

    });

  });

});


/* ARTICLE SEARCH */

function searchArticles() {

  const input = document.getElementById("searchInput");

  const grid = document.getElementById("articleGrid");

  if (!input || !grid) return;

  const searchText = input.value
    .toLowerCase()
    .trim();

  const articles = grid.querySelectorAll(".article-card");

  let found = 0;

  articles.forEach(function (article) {

    const text = article.textContent.toLowerCase();

    if (text.includes(searchText)) {

      article.style.display = "";

      found++;

    } else {

      article.style.display = "none";

    }

  });


  /* SEARCH RESULT MESSAGE */

  let resultMessage =
    document.getElementById("searchResultMessage");

  if (!resultMessage) {

    resultMessage = document.createElement("p");

    resultMessage.id = "searchResultMessage";

    resultMessage.style.textAlign = "center";
    resultMessage.style.marginTop = "25px";
    resultMessage.style.fontWeight = "600";

    grid.parentNode.appendChild(resultMessage);

  }


  if (searchText === "") {

    resultMessage.textContent = "";

    return;

  }


  if (found === 0) {

    resultMessage.textContent =
      "कोई matching article नहीं मिला।";

  } else {

    resultMessage.textContent =
      found + " article मिला।";

  }

}


/* SEARCH WITH ENTER KEY */

document.addEventListener("DOMContentLoaded", function () {

  const input = document.getElementById("searchInput");

  if (!input) return;

  input.addEventListener("keydown", function (event) {

    if (event.key === "Enter") {

      event.preventDefault();

      searchArticles();

    }

  });

});


/* NEWSLETTER / SUBSCRIBE */

function subscribe(event) {

  event.preventDefault();

  const form = event.target;

  const emailInput = form.querySelector("input[type='email']");

  if (!emailInput) return;

  const email = emailInput.value.trim();

  if (!email) {

    alert("कृपया अपना email डालें।");

    return;

  }


  alert(
    "धन्यवाद! आपका email अभी demo subscription में दर्ज किया गया है।"
  );

  form.reset();

}


/* LOAD MORE MESSAGE */

function showMessage() {

  alert(
    "और नए articles जल्द ही PickPrime पर उपलब्ध होंगे।"
  );

}


/* IMAGE ERROR HANDLING */

document.addEventListener("DOMContentLoaded", function () {

  const images = document.querySelectorAll("img");

  images.forEach(function (image) {

    image.addEventListener("error", function () {

      this.style.display = "none";

    });

  });

});


/* CURRENT YEAR */

document.addEventListener("DOMContentLoaded", function () {

  const yearElements =
    document.querySelectorAll("[data-current-year]");

  const year = new Date().getFullYear();

  yearElements.forEach(function (element) {

    element.textContent = year;

  });

});


/* SCROLL TO TOP */

window.addEventListener("scroll", function () {

  let button =
    document.getElementById("scrollTopButton");


  if (!button) {

    button = document.createElement("button");

    button.id = "scrollTopButton";

    button.innerHTML = "↑";

    button.setAttribute(
      "aria-label",
      "Scroll to top"
    );

    button.style.position = "fixed";
    button.style.right = "20px";
    button.style.bottom = "20px";
    button.style.width = "45px";
    button.style.height = "45px";
    button.style.border = "0";
    button.style.borderRadius = "50%";
    button.style.background = "#635bff";
    button.style.color = "#ffffff";
    button.style.fontSize = "22px";
    button.style.fontWeight = "bold";
    button.style.cursor = "pointer";
    button.style.display = "none";
    button.style.zIndex = "9999";
    button.style.boxShadow =
      "0 8px 25px rgba(0,0,0,0.18)";

    document.body.appendChild(button);


    button.addEventListener("click", function () {

      window.scrollTo({
        top: 0,
        behavior: "smooth"
      });

    });

  }


  if (window.scrollY > 400) {

    button.style.display = "block";

  } else {

    button.style.display = "none";

  }

});
