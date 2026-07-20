# workspaceOS
<img width="1920" height="1080" alt="{60A2030D-067C-4133-9C46-0CCEF83DBE15}" src="https://github.com/user-attachments/assets/cc85810b-877c-4836-a9c8-c9fa2b70fd26" />


# 1. Обновляем систему
sudo apt update && sudo apt upgrade -y

# 2. Устанавливаем curl и git (если нет)
sudo apt install -y curl git

# 3. Устанавливаем Node.js 20 LTS (через nvm - менеджер версий)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20

# 4. Устанавливаем инструменты, необходимые electron-builder для создания .deb пакетов
sudo apt install -y build-essential fakeroot dpkg-dev rpm
