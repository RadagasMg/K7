# K7 - Plateforme de Suivi Logistique

Bienvenue sur **K7**, une application web moderne et performante conçue pour la gestion et le suivi des expéditions logistiques (particulièrement adaptée pour les flux Chine - Madagascar).

## 🌟 Fonctionnalités Principales

- **Multi-Rôles** : Accès sécurisé et interfaces dédiées pour les Administrateurs, les Agents d'entrepôt et les Clients.
- **Mobile-First & Scanner-Friendly** : Interface optimisée pour les terminaux mobiles et les PDA professionnels (comme le Urovo DT50).
- **Gestion des Colis** : Suivi complet du cycle de vie d'un colis (Entrant, Non lié, Lié, En attente, Expédié, Prêt, Livré).
- **Preuves Visuelles** : Prise en charge de photos obligatoires (étiquette, balance, colis ouvert) avec compression automatique pour économiser la bande passante.
- **Mode Sombre (Dark Mode)** : Interface adaptative pour le confort visuel des utilisateurs.

---

## 👥 Rôles et Accès

Le système utilise une connexion simplifiée basée sur le **Nom** (insensible à la casse) et un mot de passe.

1. **Administrateur** : A accès à tout. Peut créer de nouveaux utilisateurs (clients ou agents), et superviser tous les colis.
2. **Agent** : Travaille principalement dans l'entrepôt. Son interface est conçue pour la rapidité : scanner, peser, photographier et mettre à jour le statut des colis.
3. **Client** : Dispose d'un tableau de bord personnel pour déclarer ses colis en attente, et suivre l'état de ses expéditions.

---

## 📖 Walkthrough (Guide d'Utilisation)

### 1. Pour les Administrateurs
- **Connexion** : Connectez-vous avec le compte administrateur par défaut.
- **Création d'utilisateurs** : Allez dans l'onglet **Utilisateurs**. Saisissez le nom, le mot de passe (min. 8 caractères) et choisissez le rôle (Client, Agent, Admin).
- **Supervision** : L'onglet **Tous les Colis** offre une vue d'ensemble sur l'activité de l'entrepôt.

### 2. Pour les Clients
- **Déclaration** : Avant même que le colis n'arrive à l'entrepôt, allez dans **Déclarer** et entrez le numéro de suivi (Tracking Number) fourni par votre fournisseur. Le colis passe en statut *Entrant*.
- **Suivi** : Sur le **Tableau de bord**, suivez l'évolution de vos colis. Vous y verrez le poids enregistré et les photos prises par les agents.

### 3. Pour les Agents (Opérations en Entrepôt)
L'interface Agent est le cœur opérationnel de K7 et se divise en deux parties :

#### A. Réception & Mise à jour
- **Scan** : Le champ de recherche est toujours actif (auto-focus). Scannez un colis.
- **Flux Automatisé (Urovo DT50)** : 
  1. Lors du scan, la caméra s'ouvre **automatiquement** pour prendre la photo de l'étiquette.
  2. Une fois la photo prise, le curseur se place sur le champ "Poids".
  3. Saisissez le poids et appuyez sur "Entrée" : la caméra s'ouvre à nouveau pour la photo sur la balance.
  4. Enfin, la caméra s'ouvre une dernière fois pour la photo du colis ouvert.
- **Impression** : Vous pouvez réimprimer le code-barres d'un colis si l'étiquette originale est endommagée.
- **Archivage** : Les colis traités peuvent être archivés (suppression logique) et consultés dans l'onglet "Archives".

#### B. Mise en Sac (Packing)
Ce flux est conçu pour scanner des colis à la chaîne et les grouper dans un sac/pack d'expédition.
- **Création de sac** : Cliquez sur "Créer un nouveau pack". Le système génère un ID unique (ex: `K7PK-260522002`) et **imprime automatiquement l'étiquette** du pack.
- **Remplissage** : Le pack est "Ouvert". Scannez les colis un par un. Ils sont automatiquement ajoutés au pack et leur statut passe à "En attente".
- **Contrôle** : Le poids total estimé et le nombre de colis se mettent à jour en temps réel.
- **Fermeture** : Une fois plein, cliquez sur "Fermer le pack" pour le verrouiller.

---

## 📱 Utilisation avec le PDA Urovo DT50

L'application K7 a été spécifiquement optimisée pour être utilisée avec des terminaux durcis comme le **Urovo DT50** fonctionnant sous Android.

### Configuration du Urovo DT50
Pour une expérience fluide, assurez-vous que l'application de scan native du Urovo (Scanner / Keyboard Wedge) est configurée ainsi :
1. **Mode de sortie (Output Mode)** : Réglez sur `Keyboard Output` (Sortie clavier). Le scanner agira comme si vous tapiez très vite sur un clavier.
2. **Suffixe (Additional Character)** : Assurez-vous que l'action de fin de scan est réglée sur `Enter` (Retour chariot / Carriage Return).

### Flux de travail sur le DT50
1. Ouvrez le navigateur (Google Chrome) sur le Urovo DT50 et connectez-vous à K7 avec un compte Agent.
2. L'application affiche l'interface Agent. Le curseur se place **automatiquement** dans le champ de recherche.
3. **Pointez et Scannez** : Appuyez sur la gâchette matérielle du DT50 pour scanner le code-barres du colis.
4. Le numéro de suivi est instantanément rempli et validé.
5. **Enchaînement automatique** : L'appareil photo s'ouvre pour l'étiquette -> Saisie du poids -> Appareil photo pour la balance -> Appareil photo pour le colis ouvert.
6. Validez. La modale se ferme et le curseur se replace prêt pour le colis suivant.

*Note : L'interface utilise des mises à jour d'état optimistes pour garantir que l'application réponde instantanément, même lors de scans très rapides en rafale.*

---

## 🛠 Stack Technique

- **Frontend** : Next.js 15+ (App Router), React, Tailwind CSS v4.
- **Backend / BaaS** : Firebase (Authentication, Firestore pour la base de données temps réel, Cloud Storage pour les images).
- **UI/UX** : Lucide React (Icônes), Sonner (Notifications toast), Next-Themes (Dark mode).
