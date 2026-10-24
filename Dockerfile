#parte da un'immagine che contiene Node.js
from node:24-slim

#imposta /app come cartella di lavoro dentro il container.
workdir /app

#copia i file che descrivono le dipendenze e installa le librerie necessarie.
copy package.json package-lock.json ./
run npm install

#copia il codice del progetto nel container.
copy . .

expose 3000

#definisce il comando da eseguire quando il container viene avviato direttamente con questa configurazione.
cmd ["npm", "run", "dev", "--", "--hostname", "0.0.0.0"]
