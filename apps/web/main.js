const page = document;
const packElement = page.querySelector("#pack");
const statusElement = page.querySelector("#status");
const picksElement = page.querySelector("#picks");
const roundElement = page.querySelector("#round");

const fixturePacks = ["ABC", "DEF", "GHI"];
const picksPerSeat = fixturePacks.length;
const totalFixturePicks = picksPerSeat * 2;
let currentPick = 0;

function renderFixturePack() {
  const renderedPick = currentPick;

  if (renderedPick === totalFixturePicks) {
    packElement.replaceChildren();
    statusElement.textContent = `Draft complete. You picked ${currentPick} cards.`;
    statusElement.tabIndex = -1;
    statusElement.focus();
    return;
  }

  const fixturePack = fixturePacks[renderedPick % picksPerSeat];
  const seatNumber = Math.floor(renderedPick / picksPerSeat) + 1;
  const packNumber = (renderedPick % picksPerSeat) + 1;

  roundElement.textContent = packNumber;
  statusElement.textContent = `Seat ${seatNumber}, fixture pack ${packNumber}. Choose one card.`;
  packElement.replaceChildren(
    ...[...fixturePack].map((fixtureIdentity) => createCardButton(fixtureIdentity, renderedPick))
  );
}

function createCardButton(fixtureIdentity, renderedPick) {
  const cardButton = page.createElement("button");
  cardButton.textContent = `Fixture ${fixtureIdentity}`;
  cardButton.onclick = () => chooseCard(cardButton, renderedPick);
  return cardButton;
}

function chooseCard(cardButton, renderedPick) {
  if (renderedPick !== currentPick) return;

  cardButton.disabled = true;
  const pickedCard = page.createElement("li");
  pickedCard.textContent = cardButton.textContent;
  picksElement.append(pickedCard);
  currentPick += 1;
  renderFixturePack();
  packElement.firstChild?.focus();
}

renderFixturePack();
