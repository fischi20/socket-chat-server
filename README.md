# User Manual

- [Install](#install)
- [Usage](#usage)

## Install
We don't recommend to install this software on your machiene, it's better if you use the "online version"

0. Requirements
- [Git](https://git-scm.com/)
- [Node.js 16 or higher](https://nodejs.org/en/)
- [PHP 8.2 or higher](https://www.php.net/)
- [Composer](https://getcomposer.org/)
- [MariaDB](https://mariadb.org/)

1. Git Clone
```bash
git clone  https://github.com/EmmanuelScopelliti/InformationSecurity.git
git clone  # TODO ChatServerURL
```

2. Install dependencies
```bash
    cd InformationSecurity
    composer install
    # setup the environment
    bin/console system:setup
    # create database with a basic setup (admin user and storefront sales channel)
    bin/console system:install --create-database --basic-setup

    cd chat-server
    npm install
```

3. run server
    - Main Shopware server
        config yout Nginx/Apache, have fun ;)
    - Chat server
```bash
        cd chat-server
        npm run start
```

## Usage
it's pretty much like ebay, you can login/register, buy/sell stuff and chat with a seller/buyer
